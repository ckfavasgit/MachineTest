import './App.css'
import { useState } from 'react'
import { LeaveWizard } from './features/employee/LeaveWizard'
import { ApprovalQueue } from './features/manager/ApprovalQueue'

function App() {
  const [role, setRole] = useState<'employee' | 'manager'>('employee')

  return (
    <div className="appShell">
      <header className="topbar">
        <div>
          <div className="brand">Leave Application Wizard</div>
          <div className="muted">Employee apply flow + Manager approval queue</div>
        </div>
        <nav className="tabs" aria-label="Role switch">
          <button
            type="button"
            className={role === 'employee' ? 'tab tab--active' : 'tab'}
            onClick={() => setRole('employee')}
          >
            Employee
          </button>
          <button
            type="button"
            className={role === 'manager' ? 'tab tab--active' : 'tab'}
            onClick={() => setRole('manager')}
          >
            Manager
          </button>
        </nav>
      </header>

      <main className="content">
        {role === 'employee' ? <LeaveWizard /> : <ApprovalQueue />}
      </main>
    </div>
  )
}

export default App
