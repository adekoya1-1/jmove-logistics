import { useState, useEffect } from 'react';
import { statesAPI } from '../../api/client.js';
import './AdminStates.css';

export default function AdminStates() {
  const [states, setStates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterDirection, setFilterDirection] = useState('All');
  const [error, setError] = useState('');

  const DIRECTIONS = [
    'All',
    'North West',
    'North East',
    'North Central',
    'South West',
    'South East',
    'South South',
  ];

  const fetchStates = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await statesAPI.list();
      if (res.success) {
        setStates(res.data);
      }
    } catch (err) {
      setError(err.message || 'Failed to load states');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStates();
  }, []);

  const handleToggle = async (stateId) => {
    // Optimistic UI toggle
    setStates((prev) =>
      prev.map((s) => (s._id === stateId ? { ...s, isActive: !s.isActive } : s))
    );

    try {
      await statesAPI.toggle(stateId);
    } catch (err) {
      // Revert on error
      fetchStates();
      alert(`Failed to toggle state: ${err.message}`);
    }
  };

  const filteredStates = states.filter((s) => {
    if (filterDirection !== 'All' && s.direction !== filterDirection) return false;
    if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="admin-states">
      <div className="as-header">
        <div>
          <h1 className="as-page-title">State Availability</h1>
          <p className="as-page-sub">
            Control which states are available for customer booking. Disabling a state hides it from routing options.
          </p>
        </div>
      </div>

      {error && <div className="as-error">❌ {error}</div>}

      <div className="as-controls">
        <input
          type="text"
          className="as-search"
          placeholder="Search by state name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        
        <div className="as-tabs">
          {DIRECTIONS.map((dir) => (
            <button
              key={dir}
              className={`as-tab ${filterDirection === dir ? 'as-tab--active' : ''}`}
              onClick={() => setFilterDirection(dir)}
            >
              {dir}
            </button>
          ))}
        </div>
      </div>

      <div className="as-table-card">
        {loading ? (
          <div className="as-loading">Loading states...</div>
        ) : (
          <div className="as-table-wrap">
            <table className="as-table">
              <thead>
                <tr>
                  <th>State Name</th>
                  <th>Direction</th>
                  <th className="as-center">Availability</th>
                  <th className="as-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredStates.map((state) => (
                  <tr key={state._id} className={!state.isActive ? 'as-row-inactive' : ''}>
                    <td>
                      <div className="as-state-name">{state.name}</div>
                    </td>
                    <td>
                      <span className="as-direction-badge">{state.direction}</span>
                    </td>
                    <td className="as-center">
                      <span className={`as-status-badge ${state.isActive ? 'active' : 'inactive'}`}>
                        {state.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="as-right">
                      <label className="as-toggle">
                        <input
                          type="checkbox"
                          checked={state.isActive}
                          onChange={() => handleToggle(state._id)}
                        />
                        <span className="as-slider"></span>
                      </label>
                    </td>
                  </tr>
                ))}
                {filteredStates.length === 0 && (
                  <tr>
                    <td colSpan="4" className="as-empty">
                      No states found matching your criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
