import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Shell } from "@/components/Shell";
import { RequireAuth } from "@/components/Guard";
import Home from "@/pages/Home";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";

const Calendar = lazy(() => import("@/pages/Calendar"));
const Availability = lazy(() => import("@/pages/Availability"));
const Gallery = lazy(() => import("@/pages/Gallery"));
const Files = lazy(() => import("@/pages/Files"));
const Admin = lazy(() => import("@/pages/Admin"));

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

export default function App() {
  return (
    <>
      <ScrollTop />
      <Suspense fallback={null}>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<Home />} />
            <Route path="login" element={<Login />} />
            <Route path="signup" element={<Signup />} />
            <Route path="calendar" element={<RequireAuth><Calendar /></RequireAuth>} />
            <Route path="availability" element={<RequireAuth admin><Availability /></RequireAuth>} />
            <Route path="gallery" element={<RequireAuth><Gallery /></RequireAuth>} />
            <Route path="files" element={<RequireAuth><Files /></RequireAuth>} />
            <Route path="admin" element={<RequireAuth admin><Admin /></RequireAuth>} />
            {/* old .html links keep working */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </>
  );
}
