try {
  for (let k of ['error', 'log', 'warn']) {
    const native = console[k].bind(console);
    console[k] = (...args) => native(new Date().toLocaleString(), ...args);
  }
} catch (e) {}
process
  .on('uncaughtException', console.error)
  .on('unhandledRejection', (reason) => console.error('UncatchedPromise:', reason));

const mysql = require('mysql');
const express = require('express');
const cuid = require('cuid');
const g2fa = require('./google-authenticator-nodejs');
// kovan network
const loginJSON = require('../smartcontract/build/contracts/Login.json');
const resolvers = {};

require('./login_contract')((e) => {
  console.log('sssss');
  const sender = (e.returnValues.sender + '').toLowerCase();
  const resolver = resolvers[sender];

  if (!resolver) return console.log('No resolver for:', sender);
  resolver[2](
    (e.returnValues.challenge + '').replace(/^[\r\n\s]+|[\r\n\s]+$/g, '') === resolver[0]
      ? false
      : 'wrong',
  );
  delete resolvers[sender];
});

/*
setInterval(() => {
  console.log('Virtual blockchain');
  for (let sender in resolvers) {
    resolvers[sender][2]();
    delete resolvers[sender];
  }
}, 50000);
*/

setInterval(() => {
  console.log('Cleanup');
  const expireTime = Date.now() - 3 * 60000; // 3 minutes
  for (let sender in resolvers) {
    const resolver = resolvers[sender];
    if (expireTime > resolver[1]) {
      // login timeout
      resolver[2]('timeout');
      delete resolvers[sender];
    }
  }
}, 30000);

const db = mysql.createPool({
  connectionLimit: 10,
  user: 'root',
  password: '12345678',
  database: 'blockchain_safe_login',
});

const app = express();
const server = require('http').Server(app);
const io = require('socket.io')(server);
const cleanupSocket = (socket) => {
  delete socket.__user;
  delete socket.__waddress;
};

app.use('/', express.static('./public'));

app.disable('x-powered-by');

io.on('connection', (socket) => {
  socket.__failed_attempt = 5;
  socket.__step = 'login';
  socket.emit('loginAddress', loginJSON.networks['5777'].address, loginJSON.abi);

  socket.on('disconnect', (r) => {
    console.log(socket.id, 'disconnected');
    if (socket.__step === 'challenge' && socket.__waddress) {
      const resolver = resolvers[socket.__waddress];
      if (resolver) {
        delete resolvers[socket.__waddress];
        resolver[2]('disconnect');
      }
    }
  });
  socket.on('error', (e) => {
    console.error('error', e);
    socket.disconnect();
  });

  socket.on('login', (data, fn) => {
    if (typeof fn !== 'function') {
      console.error('login: fn is not function');
      socket.disconnect();
      return;
    }
    try {
      if (socket.__failed_attempt < 1) {
        fn({ error: 'B???n ???? ????ng nh???p sai 5 l???n. Vui l??ng th??? l???i sau.' });
        return;
      }
      if (!data.waddress) {
        fn({ error: 'Vui l??ng nh???p ?????a ch??? v?? c???a b???n.' });
        return;
      }
      data.waddress = (data.waddress + '').toLowerCase();
      if (!data.waddress.startsWith('0x')) data.waddress = '0x' + data.waddress;
      if (!/0x[\da-f]{40}/.test(data.waddress)) {
        fn({ error: '?????a ch??? v?? kh??ng h???p l???.' });
        return;
      }
      const waddress = data.waddress;
      socket.__waddress = waddress;
      if (socket.__step !== 'login') {
        console.log(socket.__step);
        fn({ error: 'Kh??ng ph???i ????ng nh???p l??c n??y' });
        return;
      }

      socket.__step = 'challenge';
      // ??ang c?? ng?????i ????ng nh???p, kickass
      const resolver = resolvers[waddress];
      if (resolver) {
        resolver[2]('dup');
        delete resolvers[waddress];
      }

      if (!socket.challenge) socket.challenge = cuid();
      resolvers[waddress] = [
        socket.challenge,
        Date.now(),
        (rejectReason) => {
          console.log('Got status:', waddress, rejectReason || 'approved');

          try {
            if (rejectReason) {
              socket.emit('challenge.error', rejectReason);
              socket.__step = 'login';
              cleanupSocket(socket);
              return;
            }
            db.query('select * from users where waddress = ? limit 1', [waddress], (e, r) => {
              try {
                if (e) {
                  console.error(e);
                  socket.__step = 'login';
                  socket.emit('challenge.error', 'db');
                  cleanupSocket(socket);
                  return;
                }
                if (!r || r.length < 1) {
                  // ????ng k??
                  socket.emit('login_step', 'register');
                  socket.__user = {
                    waddress,
                  };
                  socket.__step = 'register';
                  return;
                }
                r = r[0];
                socket.__user = r;
                if (r.secret) {
                  socket.emit('login_step', 'otp');
                  socket.__step = 'otp';
                  return;
                }
                socket.__step = 'loggedin';
                socket.emit('user', socket.__user);
                socket.__failed_attempt = 5;
              } catch (e) {
                console.error(e);
                socket.disconnect();
              }
            });
          } catch (e) {
            console.error(e);
            socket.disconnect();
          }
        },
      ];
      fn({ challenge: socket.challenge });
    } catch (e) {
      console.error(e);
      fn({ error: 'Something bad happended' });
      socket.disconnect();
    }
  });

  socket.on('register', (user, fn) => {
    if (typeof fn !== 'function') {
      console.error('login: fn is not function');
      socket.disconnect();
      return;
    }
    try {
      if (socket.__step !== 'register') return fn({ error: 'Kh??ng ph???i ????ng k?? l??c n??y' });
      if (!user || !user.name) return fn({ error: 'Vui l??ng nh???p t??n c???a b???n' });
      user.name += '';
      if (!socket.__user || !socket.__user.waddress) return fn({ error: 'Vui l??ng th??? l???i sau' });
      db.query(
        'insert users (waddress, name) values (?, ?)',
        [socket.__user.waddress, user.name],
        (e, r) => {
          if (e) {
            console.error(e);
            fn({ error: 'Vui l??ng th??? l???i sau' });
            return;
          }
          socket.__user.name = user.name;
          socket.__step = 'loggedin';
          socket.emit('user', socket.__user);
          socket.__failed_attempt = 5;
          fn({ success: '????ng k?? th??nh c??ng' });
        },
      );
    } catch (e) {
      console.error(e);
      fn({ error: 'Something bad happended' });
      socket.disconnect();
    }
  });

  socket.on('otp', (code, fn) => {
    if (typeof fn !== 'function') return console.error('fn is not function');
    try {
      if (socket.__step !== 'otp' || !socket.__user)
        return fn({ error: 'Kh??ng ph???i x??c nh???n otp l??c n??y' });
      if (
        !socket.__user.secret ||
        (/^\d{6}$/.test(code) && g2fa.verifyCode(socket.__user.secret, code))
      ) {
        socket.__user.secret = '*';
        socket.__step = 'loggedin';
        socket.emit('user', socket.__user);
        socket.__failed_attempt = 5;
        fn({ success: '???? ???????c x??c nh???n' });
        return;
      }
      if (socket.__failed_attempt < 1) {
        socket.emit('login_step', 'login');
        socket.__step = 'login';
        cleanupSocket(socket);
        fn({ error: 'X??c th???c th???t b???i: B???n ???? nh???p sai qu?? nhi???u l???n' });
        return;
      }
      fn({ error: 'X??c th???c th???t b???i' });
      socket.__failed_attempt--;
    } catch (e) {
      console.error(e);
      fn({ error: 'Something bad happended' });
    }
  });

  socket.on('change.secret', (fn) => {
    if (typeof fn !== 'function') return console.error('fn is not function');
    try {
      if (socket.__step !== 'loggedin') {
        fn({ error: 'Kh??ng th??? thay ?????i secret l??c n??y' });
        return;
      }
      const secret = g2fa.generateSecret();
      db.query(
        'update users set secret = ? where waddress = ? limit 1',
        [secret, socket.__user.waddress],
        (e) => {
          if (e) {
            fn({ error: 'L???i c?? s??? d??? li???u, vui l??ng th??? l???i sau' });
            console.error(e);
            return;
          }
          fn({ success: g2fa.getQrcode(socket.__user.waddress, secret, 'vinhjaxt') });
        },
      );
    } catch (e) {
      console.error(e);
      fn({ error: 'Something bad happended' });
    }
  });

  socket.on('delete.secret', (fn) => {
    if (typeof fn !== 'function') return console.error('fn is not function');
    try {
      if (socket.__step !== 'loggedin') {
        fn({ error: 'Kh??ng th??? thay ?????i secret l??c n??y' });
        return;
      }
      db.query(
        'update users set secret = "" where waddress = ? limit 1',
        [socket.__user.waddress],
        (e) => {
          if (e) {
            fn({ error: 'L???i c?? s??? d??? li???u, vui l??ng th??? l???i sau' });
            console.error(e);
            return;
          }
          fn({ success: '???? xo?? OTP' });
        },
      );
    } catch (e) {
      console.error(e);
      fn({ error: 'Something bad happended' });
    }
  });
});

server.listen(80, () => console.log('Server running on :80'));
