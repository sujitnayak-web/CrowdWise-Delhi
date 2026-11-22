import { MotionConfig } from 'motion/react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { TransitAppProvider } from './context/TransitAppContext';
import { CrowdMap } from './pages/CrowdMap';
import { Home } from './pages/Home';
import { MLInsights } from './pages/MLInsights';
import { OperatorView } from './pages/OperatorView';
import { Planner } from './pages/Planner';
import { APP_PATHS } from './utils/routesConfig';

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <HashRouter>
        <TransitAppProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Home />} />
              <Route path={APP_PATHS.PLANNER} element={<Planner />} />
              <Route path={APP_PATHS.CROWD_MAP} element={<CrowdMap />} />
              <Route path={APP_PATHS.OPERATOR} element={<OperatorView />} />
              <Route path={APP_PATHS.ML_INSIGHTS} element={<MLInsights />} />
              <Route path="*" element={<Navigate to={APP_PATHS.HOME} replace />} />
            </Route>
          </Routes>
        </TransitAppProvider>
      </HashRouter>
    </MotionConfig>
  );
}
