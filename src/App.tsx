import { SpaceScene } from './render/SpaceScene'
import { BuildPanel } from './ui/BuildPanel'
import { Inspector } from './ui/Inspector'
import { Navigator } from './ui/Navigator'
import { Toast } from './ui/Toast'
import { TopBar } from './ui/TopBar'

export default function App() {
  return (
    <div className="app">
      <SpaceScene />
      <div className="hud">
        <TopBar />
        <div className="hud__body">
          <div className="hud__column">
            <BuildPanel />
            <Navigator />
          </div>
          <div className="hud__column">
            <Inspector />
          </div>
        </div>
        <footer className="panel hintbar muted">
          <span>Drag · orbit</span>
          <span>Scroll · zoom</span>
          <span>Click planet / label · travel</span>
          <span>Click module · inspect</span>
        </footer>
      </div>
      <Toast />
    </div>
  )
}
