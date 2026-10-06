import { contextBridge, ipcRenderer } from 'electron'

const api = {
  loadProgress: (): Promise<unknown> => ipcRenderer.invoke('progress:load'),
  saveProgress: (data: unknown): Promise<void> => ipcRenderer.invoke('progress:save', data),
  /** Blocking save for window close: an async invoke can be cut off when the renderer is torn down. */
  saveProgressSync: (data: unknown): void => {
    ipcRenderer.sendSync('progress:saveSync', data)
  }
}

export type FretwiseApi = typeof api

contextBridge.exposeInMainWorld('fretwise', api)
