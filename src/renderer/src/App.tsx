import Toolbar from './components/Toolbar'
import PageCanvas from './components/PageCanvas'
import PropertiesPanel from './components/PropertiesPanel'
import StatusBar from './components/StatusBar'

declare global {
  interface Window {
    briefy?: { version: string }
  }
}

const APP_VERSION = window.briefy?.version ?? '0.0.2'

function App(): JSX.Element {
  return (
    <div className="app">
      <Toolbar />
      <div className="workspace">
        <PageCanvas />
        <PropertiesPanel />
      </div>
      <StatusBar version={APP_VERSION} />
    </div>
  )
}

export default App
