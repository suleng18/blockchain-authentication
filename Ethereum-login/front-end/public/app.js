/* global jQuery, Vue, PNotify, io */
// pnotify
PNotify.prototype.options.styling = 'fontawesome'
function showNotify(o) {
  var defaultOptions = {
    buttons: {
      closer: true,
      sticker: false
    }
  }
  if (arguments.length > 1) {
    if (arguments.length == 2) {
      o = {
        type: arguments[0],
        text: arguments[1]
      }
    } else {
      o = {
        type: arguments[0],
        title: arguments[1],
        text: arguments[2]
      }
    }
  } else {
    if (typeof (o) === 'string') {
      o = {
        type: 'info',
        text: o
      }
    }
  }
  var notice = new PNotify(Object.assign({}, defaultOptions, o))
  notice.get().click(function () {
    notice.remove()
  })
  return notice
}
// eslint-disable-next-line no-unused-vars
var app = new Vue({
  el: '#app',
  data: {
    loggedin: false,
    login_step: 'login',
    user: {},
    login_challenge: '',
    currentTab: null,
    tabs: [{
      name: 'Home',
      component: 'home'
    }],
    otpQrcodeURL: '',
    loginAddress: '',
    metamaskAccounts: [],
    metaMaskEnabled: false,
    enableDoTransaction: false
  },
  mounted: function () {
    var self = this
    self.currentTab = ''
    self.enableMetaMask()
    self.initSocket()
  },
  watch: {
    currentTab: function (newVal) {
      // array.some ? no, es5 :(
      var self = this
      for (var i = 0; i < this.tabs.length; i++) {
        if (this.tabs[i].component == newVal) { return }
      }
      this.$nextTick(function () {
        if (self.currentTab == '') {
          if (this.loggedin) {
            self.currentTab = 'home'
          } else {
            self.currentTab = 'login'
          }
        }
      })
    },
    loggedin: function (val) {
      if (val === false) {
        this.currentTab = 'login'
      }
    }
  },
  methods: {
    async metamaskDoTransaction() {
      this.enableDoTransaction = false
      try {
        const caller = this.$loginContract.methods.login(this.login_challenge)
        const estimatedGas = await caller.estimateGas({
          from: this.activeAccount,
        })
        await caller.send({
          from: this.activeAccount,
          gasLimit: estimatedGas + Math.round(estimatedGas * 10 / 100) // add 10%
        })
        console.log('Transaction completed')
      } catch (e) {
        this.enableDoTransaction = this.metaMaskEnabled
        console.error(e)
        alert('An error occurred. Please see in Console window')
      }
    },
    async enableMetaMask() {
      if (!window.ethereum) return
      this.$web3 = new Web3(window.ethereum)
      await window.ethereum.enable()
      this.metaMaskEnabled = true
      this.metamaskAccounts = await ethereum.request({ method: 'eth_accounts' })
    },
    logout: function () {
      var self = this
      self.socket.disconnect()
    },
    initSocket: function () {
      var self = this
      var socket = io(location.href)

      socket.on('connect', function () {
        console.log('Socket connected')
        self.socket = socket
        showNotify('success', '???? k???t n???i t???i server')
        if (self.loggedin === false) {
          self.currentTab = 'login'
          self.login_step = 'login'
        }
      })

      socket.on('disconnect', function () {
        self.socket = null
        self.loggedin = false
        self.login_step = 'login'
        self.currentTab = 'login'
        showNotify('error', 'B???n b??? ng???t k???t n???i t???i server')
      })

      socket.on('loginAddress', function (addr, abi) {
        self.loginAddress = addr
        if (!self.$web3) return
        self.$loginContract = new self.$web3.eth.Contract(abi, addr)
      })

      socket.on('user', function (u) {
        self.user = u
        self.loggedin = true
        self.currentTab = 'home'
        self.login_step = 'loggedin'
      })

      socket.on('login_step', function (s) {
        self.login_step = s
        if (s === 'otp') self.currentTab = 'otp'
        else if (s === 'login') self.currentTab = 'login'
        else if (s === 'register') self.currentTab = 'register'
      })

      socket.on('challenge.error', function (r) {
        if (r === 'timeout') {
          showNotify('error', '???? qu?? th???i gian x??c th???c ?????a ch??? v?? c???a b???n.')
          self.currentTab = 'login'
          self.login_step = 'login'
          return
        }
        if (r === 'wrong') {
          showNotify('error', 'B???n ???? th???c hi???n smartcontract v???i n???i dung kh??ng ????ng v???i y??u c???u.')
          self.currentTab = 'login'
          self.login_step = 'login'
          return
        }
        if (r === 'dup') {
          showNotify('error', 'C?? ai ???? ??ang c??? g???ng x??c th???c ?????a ch??? v?? c???a b???n.')
          self.currentTab = 'login'
          self.login_step = 'login'
          return
        }
        showNotify('error', 'Vui l??ng th??? l???i sau.')
        self.currentTab = 'login'
        self.login_step = 'login'
      })
    },
    deleteSecret: function () {
      var self = this
      if (!self.socket || self.login_step !== 'loggedin') {
        showNotify('error', 'Kh??ng th??? x??a secret l??c n??y')
      }
      self.socket.emit('delete.secret', function (r) {
        if (r.error) {
          showNotify('error', r.error)
          return
        }
        self.$delete(self.user, 'secret')
        if (r.success) {
          showNotify('success', r.success)
        }
      })
    },
    verifyOTP: function ($e) {
      var self = this
      if (!self.socket || self.login_step !== 'otp') {
        showNotify('error', 'Kh??ng th??? x??c th???c OTP l??c n??y')
        return
      }
      var code = $e.target.otp_code.value
      if (!/^\d{6}$/.test(code)) {
        showNotify('error', 'M?? OTP kh??ng h???p l???')
        return
      }
      self.socket.emit('otp', code, function (r) {
        if (r.error) {
          showNotify('error', r.error)
          // self.currentTab = 'login'
          return
        }
        self.$set(self.user, 'secret', '*')
        if (r.success) {
          showNotify('success', r.success)
        }
      })
    },
    login: function ($e) {
      var self = this
      if (!self.socket || self.login_step !== 'login') {
        showNotify('error', 'Kh??ng th??? ????ng nh???p l??c n??y')
      }
      var form = $e.target
      var waddress = form.waddress.value
      if (!waddress) waddress = form.waddress2.value
      if (!waddress.startsWith('0x')) waddress = '0x' + waddress
      this.enableDoTransaction = this.metaMaskEnabled
      this.activeAccount = waddress
      self.socket.emit('login', { waddress: waddress }, function (r) {
        if (r.error) {
          showNotify('error', r.error)
          return
        }
        self.login_challenge = r.challenge
        self.login_step = 'challenge'
        self.currentTab = 'challenge'
      })
    },
    register: function ($e) {
      var self = this
      if (!self.socket || self.login_step !== 'register') {
        showNotify('error', 'Kh??ng th??? ????ng k?? l??c n??y')
      }
      var form = $e.target
      var name = form.name.value
      self.socket.emit('register', { name: name }, function (r) {
        if (r.error) {
          showNotify('error', r.error)
          return
        }
        if (r.success) {
          showNotify('success', r.success)
        }
      })
    },

    changeSecret: function () {
      var self = this
      if (!self.socket || self.login_step !== 'loggedin') {
        showNotify('error', 'Kh??ng th??? ?????i secret l??c n??y')
      }
      self.socket.emit('change.secret', function (r) {
        if (r.error) {
          showNotify('error', r.error)
          return
        }
        self.otpQrcodeURL = r.success
        self.$set(self.user, 'secret', '*')
        jQuery('#show-qrcode').modal('show')
      })
    }
  }
})
