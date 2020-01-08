// import Vue from 'vue'
// import path from 'path'
import Service from 'specky-service/service'

export default (ctx, inject) => {
  let app = ctx.app
  let opts = {
      http: app.$axios ? app.$axios : app.http,
      store: app.store
    }
  const service = Service.create(opts)
  console.log(service)
  ctx.$service = service
  inject('service', service)
}
