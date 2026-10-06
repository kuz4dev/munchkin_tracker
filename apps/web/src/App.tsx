import { Navigate, Route, Routes } from 'react-router'
import HomePage from '@/pages/HomePage'
import RoomPage from '@/pages/RoomPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/room/:code" element={<RoomPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
