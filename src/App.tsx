import { Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { RequireAuth } from './auth/RequireAuth'
import { RequireOnboarded } from './auth/RequireOnboarded'
import { Login } from './screens/Login'
import { Onboarding } from './screens/Onboarding'
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
import { MissionsHome } from './screens/MissionsHome'
import { MissionCreate } from './screens/MissionCreate'
import { MissionDiagnostic } from './screens/MissionDiagnostic'
import { StudyPlan } from './screens/StudyPlan'
import { MissionSession } from './screens/MissionSession'
import { Calendar } from './screens/Calendar'
import { Inbox } from './screens/Inbox'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        element={
          <RequireAuth>
            <Outlet />
          </RequireAuth>
        }
      >
        <Route path="onboarding" element={<Onboarding />} />

        <Route
          element={
            <RequireOnboarded>
              <AppShell />
            </RequireOnboarded>
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
          <Route path="inbox" element={<Inbox />} />
          <Route path="calendar" element={<Calendar />} />
          <Route path="missions" element={<MissionsHome />} />
          <Route path="missions/new" element={<MissionCreate />} />
          <Route path="missions/:missionId" element={<StudyPlan />} />
          <Route
            path="missions/:missionId/diagnostic"
            element={<MissionDiagnostic />}
          />
          <Route
            path="missions/:missionId/s/:planSessionId"
            element={<MissionSession />}
          />
          <Route path="learn" element={<LearnMode />} />
          <Route path="profile" element={<Profile />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
