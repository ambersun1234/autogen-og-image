"use strict";exports.id=1,exports.ids=[1],exports.modules={5001:(s,e,t)=>{t.r(e),t.d(e,{BrowserWebSocketTransport:()=>n});class n{static create(s){return new Promise(((e,t)=>{const o=new WebSocket(s);o.addEventListener("open",(()=>e(new n(o)))),o.addEventListener("error",t)}))}#s;onmessage;onclose;constructor(s){this.#s=s,this.#s.addEventListener("message",(s=>{this.onmessage&&this.onmessage.call(null,s.data)})),this.#s.addEventListener("close",(()=>{this.onclose&&this.onclose.call(null)})),this.#s.addEventListener("error",(()=>{}))}send(s){this.#s.send(s)}close(){this.#s.close()}}}};