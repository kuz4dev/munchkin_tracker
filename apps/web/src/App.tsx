import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import HomePage from '@/pages/HomePage'
import { UpdatePrompt } from '@/pwa/UpdatePrompt'

// Invite links land on the home page first, so the room screen (dialogs,
// selects, combat) loads on demand
const RoomPage = lazy(() => import('@/pages/RoomPage'))

export default function App() {
  return (
    <>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/room/:code" element={<RoomPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <UpdatePrompt />
    </>
  )
}
