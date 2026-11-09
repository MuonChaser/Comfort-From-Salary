const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cfsDesktop', {
  command: action => ipcRenderer.send('cfs:command', action),
  menu: state => ipcRenderer.send('cfs:menu', state),
  scale: value => ipcRenderer.send('cfs:scale', value),
  drag: phase => ipcRenderer.send('cfs:drag', phase),
  onControl: handler => {
    ipcRenderer.on('cfs:control', (_event, action, value) => handler(action, value));
  },
});
