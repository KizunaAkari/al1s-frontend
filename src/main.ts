import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import './app/styles.css'

import { createPinia } from 'pinia'
import { createApp } from 'vue'

import App from './app/App.vue'
import { router } from './app/router'

createApp(App).use(createPinia()).use(router).mount('#app')
