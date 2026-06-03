import { useState, useEffect } from 'react';
import type { Employee } from './types';
import { initialEmployees } from './data/mockData'; // Centralized data matrix
import Login from './components/Login';
import EmployeePortal from './components/EmployeePortal';

export default function App() {
  // Read existing staff assignments out of local storage, or fall back to the central database
  const [employees, setEmployees] = useState<Employee[]>(() => {
    const saved = localStorage.getItem('roster_employees');
    return saved ? JSON.parse(saved) : initialEmployees;
  });

  const [loggedInUser, setLoggedInUser] = useState<Employee | null>(null);

  // Cache employee data to local storage on initial run and updates
  useEffect(() => {
    localStorage.setItem('roster_employees', JSON.stringify(employees));
  }, [employees]);

  // Handle global updates triggered by the Manager Portal (e.g., toggling vacancies)
  const handleUpdateEmployees = (updatedList: Employee[]) => {
    setEmployees(updatedList);
    
    // Keep the current user state synchronized if the manager edits their own profile
    if (loggedInUser) {
      const refreshedUser = updatedList.find(e => e.id === loggedInUser.id);
      if (refreshedUser) setLoggedInUser(refreshedUser);
    }
  };

  // If nobody has typed their name into the gateway yet, show the login panel
  if (!loggedInUser) {
    return (
      <Login 
        employees={employees} 
        onLoginSuccess={(user) => setLoggedInUser(user)} 
      />
    );
  }

  // Once safely signed in, hand off tracking control to the dynamic portal view
  return (
    <EmployeePortal 
      user={loggedInUser} 
      allEmployees={employees} // Required for Manager directory
      onLogout={() => setLoggedInUser(null)} 
      onUpdateEmployees={handleUpdateEmployees} // Required for Manager vacancy toggles
    />
  );
}