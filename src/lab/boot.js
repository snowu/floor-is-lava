import { localLab } from './local.js'
import './lab.css'

if (localLab) {
  import('./lab.js')
} else {
  document.body.replaceChildren()
  const link = document.createElement('a')
  link.href = import.meta.env.BASE_URL
  link.textContent = 'The art lab is available locally. Return to Packet Loss.'
  document.body.append(link)
}
