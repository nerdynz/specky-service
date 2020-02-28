// import dateformat from 'dateformat'
import { ulid } from 'ulid'
import glue from './glue.js'
const uuidv4 = require('uuid/v4')

window.ULID = ulid
window.UUID = uuidv4

let host = ''
let wsOptions = {
  // The base URL is appended to the host string. This value has to match with the server value.
  baseURL: '',

  // Force a socket type.
  // Values: false, "WebSocket", "AjaxSocket"
  forceSocketType: false,

  // Kill the connect attempt after the timeout.
  connectTimeout: 10000,

  // If the connection is idle, ping the server to check if the connection is stil alive.
  pingInterval: 35000,
  // Reconnect if the server did not response with a pong within the timeout.
  pingReconnectTimeout: 5000,

  // Whenever to automatically reconnect if the connection was lost.
  reconnect: true,
  reconnectDelay: 1000,
  reconnectDelayMax: 5000,
  // To disable set to 0 (endless).
  reconnectAttempts: 10,

  // Reset the send buffer after the timeout.
  resetSendBufferTimeout: 10000
}

// Create and connect to the server.
// Optional pass a host string and options.
let serviceGlobal // eslint-disable-line

class Event {
  constructor () {
    this.events = {}
  }

  on (eventName, fn) {
    this.events[eventName] = this.events[eventName] || []
    this.events[eventName].push(fn)
  }

  off (eventName, fn) {
    if (this.events[eventName]) {
      for (let i = 0; i < this.events[eventName].length; i++) {
        if (this.events[eventName][i] === fn) {
          this.events[eventName].splice(i, 1)
          break
        }
      }
    }
  }

  trigger (eventName, data) {
    if (this.events[eventName]) {
      this.events[eventName].forEach(function (fn) {
        fn(data)
      })
    }
  }
}

// store.state.auth.details.
export default class Service {
  constructor (options) {
    this.http = options.http
    this.ws = options.ws
    this.schemaURL = options.schemaURL || '/api/v1/schema'
    this.store = options.store
    /* it is better to pass a preloaded schema in, otherwise we might hit a race condition
       of the schema not being loaded before a service is called.
       probably best to inject it serverside?
    */
    this.schema = window.websiteSchema || options.schema
    this.isReady = false
    this.eventBus = new Event()
  }

  static create (options) {
    serviceGlobal = new Service(options)
    serviceGlobal.init()
    return {
      UUID: function () {
        return uuidv4()
      },
      ULID: function () {
        return ulid()
      },
      new: function (type, siteID) {
        type = uppercaseFirst(type)
        let record = serviceGlobal.construct(type)
        if (Object.prototype.hasOwnProperty.call(record, 'UUID')) {
          record.UUID = uuidv4()
        } else if (Object.prototype.hasOwnProperty.call(record, 'ULID')) {
          record.ULID = ulid()
        } else {
          record.UniqueID = ulid()
        }
        checkSiteID(record, siteID)
        return record
      },
      retrieve: function (type, recordID, ...qs) {
        qs = makeQs(qs)
        type = uppercaseFirst(type)
        return serviceGlobal.retrieve(type, recordID, qs)
      },
      paged: function (type, sort, direction, limit, pageNum, ...qs) {
        qs = makeQs(qs)
        type = uppercaseFirst(type)
        return serviceGlobal.paged(type, sort, direction, limit, pageNum, qs)
      },
      remove: function (type, recordID) {
        type = uppercaseFirst(type)
        if (typeof (recordID) === 'object') {
          recordID = recordID[type + 'ID']
        }
        return serviceGlobal.remove(type, recordID)
      },
      send: function (msg) {
        serviceGlobal.ws.send(msg)
      },
      subscribe: function (type, cb) {
        type = uppercaseFirst(type)
        serviceGlobal.subscribe(type, cb)
      },
      unsubscribe: function (type, cb) {
        type = uppercaseFirst(type)
        serviceGlobal.unsubscribe(type, cb)
      },
      save: function (type, record, ...qs) {
        qs = makeQs(qs)
        type = uppercaseFirst(type)
        checkSiteID(record)
        return serviceGlobal.save(type, record, qs)
      }
    }
  }

  static install (Vue, options) {
    serviceGlobal = new Service(options)
    serviceGlobal.init()

    Vue.prototype.$service = this.create
  }

  init () {
    if (!this.schema) {
      let lsSchema = window.localStorage.getItem('schema')
      if (lsSchema) {
        this.schema = JSON.parse(lsSchema)
      } else {
        this.http.get(this.schemaURL).then((response) => {
          this.schema = response.data
          window.localStorage.setItem('schema', JSON.stringify(response.data))
          this.isReady = true
          if (this.schema.IsSocketsEnabled) {
            let ws = glue(host, wsOptions)
            window.socket = ws
            this.ws = ws
            this.ws.onMessage((msg) => {
              if (this.store.state.auth.isValid) {
                if (msg === 'connected') {
                  console.log('Websocket connection active') // eslint-disable-line
                } else if (msg.indexOf('ping:') === 0) {
                  this.ws.send('pong: ' + this.store.state.auth.details.token)
                } else {
                  msg = JSON.parse(msg)
                  let type = msg.Type
                  let data = msg.Data
                  if (type && data) {
                    this.eventBus.trigger(type, data)
                  }
                }
              }
            })
          }
        })
      }
    }
  }

  // data methods
  construct (type) {
    let obj = this.schema[type]
    let record = JSON.parse(JSON.stringify(obj))
    return record
  }

  create (type, record, qs) {
    if (!qs) {
      qs = ''
    }
    // record = cleanDates(record)
    return this.http.post(`/api/v1/${type.toLowerCase()}/create${qs}`, record)
      .then((response) => { return Promise.resolve(response.data) })
      .catch((error) => { return Promise.reject(error) })
  }

  retrieve (type, recordID, qs) {
    if (!qs) {
      qs = ''
    }
    if (recordID) {
      recordID = '/' + recordID // add slash here because proxy issues
    } else {
      recordID = ''
    }
    let url = `/api/v1/${type.toLowerCase()}/retrieve${recordID}${qs}`
    return this.http.get(url)
      .then((response) => { return Promise.resolve(response.data) })
      .catch((error) => { return Promise.reject(error) })
  }

  paged (type, sort, direction, limit, pageNum, qs) {
    if (!qs) {
      qs = ''
    }
    if (!sort) {
      sort = 'default'
    }
    if (!direction) {
      direction = 'asc'
    }
    if (typeof (pageNum) === 'undefined') {
      pageNum = 1
    }
    if (typeof (limit) === 'undefined') {
      limit = 10
    }
    let url = `/api/v1/${type.toLowerCase()}/paged/${toSnakeCase(sort)}/${direction.toLowerCase()}/limit/${limit}/pagenum/${pageNum}${qs}`
    return this.http.get(url)
      .then((response) => { return Promise.resolve(response.data) })
      .catch((error) => { return Promise.reject(error) })
  }

  update (type, record, qs) {
    // record = cleanDates(record)
    if (!qs) {
      qs = ''
    }
    return this.http.put(`/api/v1/${type.toLowerCase()}/update/${record[type + 'ID']}${qs}`, record)
      .then((response) => { return Promise.resolve(response.data) })
      .catch((error) => { return Promise.reject(error) })
  }

  remove (type, recordID) {
    let promise = Promise.resolve(true)
    // let recordID = record[type + 'ID']
    if (recordID > 0) {
      promise = this.http.delete(`/api/v1/${type.toLowerCase()}/delete/${recordID}`)
        .then((response) => { return Promise.resolve(true) })
        .catch((error) => { return Promise.reject(error) })
    }
    return promise
  }

  subscribe (type, cb) {
    // start polling only once but subscribe first because the polling stops calling itself recursively in a settimeout loop if it has 0 subscribers
    console.info('sub to', type) // eslint-disable-line
    this.eventBus.on(type, cb)
  }

  unsubscribe (type, cb) {
    console.info('unsub from', type) // eslint-disable-line
    this.eventBus.off(type, cb)
  }

  save (type, record, qs) {
    if (record[type + 'ID'] <= 0) {
      // new
      return this.create(type, record, qs)
    } else {
      return this.update(type, record, qs)
    }
  }
}

function uppercaseFirst (str) {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

function toSnakeCase (s) {
  let upperChars = s.match(/([A-Z])/g)
  if (!upperChars) {
    return s
  }

  let str = s.toString()
  for (let i = 0, n = upperChars.length; i < n; i++) {
    str = str.replace(new RegExp(upperChars[i]), '_' + upperChars[i].toLowerCase())
  }

  if (str.slice(0, 1) === '_') {
    str = str.slice(1)
  }

  return str
}

function makeQs (qs) {
  let str = ''
  if (Array.isArray(qs)) { // spread operator.. new better way to do it as I can uri encode bits of the url properly
    if (qs.length % 2 === 0) {
      for (let i = 0; i < qs.length; i = i + 2) {
        let paramName = qs[i]
        let param = qs[i + 1]
        str += `&${paramName}=${encodeURIComponent(param)}`
      }
    } else {
      throw new Error('QS spread needs to be even in length.. e.g. paramName, param, paramName2, param')
    }
  }
  if (str.length > 0) {
    // str = str.replace('&', '?') // not regex so it will only replace first
    str = '?qs=1' + str
  }
  return str
}

function checkSiteID (record, siteID) {
  if ('SiteID' in record) {
    if (siteID) {
      record.SiteID = siteID
    }
    if (typeof (record.SiteID) === 'undefined' || record.SiteID <= 0) {
      throw new Error('SiteID not set')
    }
  }
}
// function cleanDates (obj) {
//   for (var property in obj) {
//     if (obj.hasOwnProperty(property) }) {
//       if (Object.prototype.toString.call(property) === '[object Array]') {
//         for (let i = 0; i < obj[property].length; i++) {
//           let innerObj = obj[property][i]
//           obj[property][i] = cleanDates(innerObj) // recursive on arrays
//         }
//       } else if (typeof (property) === 'string' && property.toLowerCase().indexOf('date') === 0) { // the convention is to start with Date i.e. DateModified so only if index === 0
//         console.log(property, obj[property])
//         console.log(dateformat(obj[property], 'isoUtcDateTime') })
//         obj[property] = dateformat(obj[property], 'isoUtcDateTime')
//         console.log(property, obj[property])
//       }
//     }
//   }
//   return obj
// }
