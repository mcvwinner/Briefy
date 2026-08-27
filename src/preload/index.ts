import { contextBridge } from 'electron'

// 后续通过 contextBridge.exposeInMainWorld 暴露文件读写、设置存储等 API
contextBridge.exposeInMainWorld('briefy', { version: '0.0.2' })
