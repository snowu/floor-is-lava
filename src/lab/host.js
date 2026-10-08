export function installArtLab({ onOpen, onClose }) {
  let overlay, iframe, open = false
  function toggle() {
    if (!overlay) {
      overlay = document.createElement('div')
      overlay.id = 'art-lab-overlay'
      overlay.setAttribute('role', 'dialog')
      overlay.setAttribute('aria-label', 'Packet Loss art lab')
      overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:#0b0c12'
      iframe = document.createElement('iframe')
      iframe.title = 'Packet Loss art lab'
      iframe.src = `${import.meta.env.BASE_URL}lab.html`
      iframe.style.cssText = 'width:100%;height:100%;border:0;display:block'
      overlay.append(iframe)
      document.body.append(overlay)
    }
    open = !open
    overlay.hidden = !open
    if (open) { onOpen(); iframe.focus() }
    else {
      onClose()
      const game = document.querySelector('#app canvas') ?? document.body
      game.tabIndex = -1
      game.focus({ preventScroll: true })
    }
    iframe.contentWindow?.postMessage({ type: 'lab-visibility', open }, location.origin)
  }
  window.addEventListener('keydown', (e) => {
    if (e.code === 'F3') {
      e.preventDefault()
      e.stopImmediatePropagation()
      if (!e.repeat) toggle()
    } else if (open) e.stopImmediatePropagation()
  }, true)
  window.addEventListener('message', (e) => {
    if (e.origin === location.origin && e.source === iframe?.contentWindow && e.data?.type === 'close-art-lab' && open) toggle()
  })
}
