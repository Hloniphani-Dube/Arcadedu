import { Routes, Route, Navigate } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { RequireAuth } from './auth/RequireAuth'
import { Login } from './screens/Login'
import { Atlas } from './screens/Atlas'
import { Country } from './screens/Country'
import { LevelPath } from './screens/LevelPath'
import { Challenge } from './screens/Challenge'
import { StoryHome } from './screens/StoryHome'
import { StoryChapter } from './screens/StoryChapter'
import { StoryChallenge } from './screens/StoryChallenge'
import { Quests } from './screens/Quests'
import { LearnMode } from './screens/LearnMode'
import { Profile } from './screens/Profile'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<Atlas />} />
        <Route path="s/:subjectId" element={<Country />} />
        <Route path="s/:subjectId/:topicId" element={<LevelPath />} />
        <Route path="play/:subjectId/:topicId/:nodeId" element={<Challenge />} />
        <Route path="story" element={<StoryHome />} />
        <Route path="story/:chapterId" element={<StoryChapter />} />
        <Route path="story/:chapterId/:levelId" element={<StoryChallenge />} />
        <Route path="quests" element={<Quests />} />
        <Route path="learn" element={<LearnMode />} />
        <Route path="profile" element={<Profile />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
