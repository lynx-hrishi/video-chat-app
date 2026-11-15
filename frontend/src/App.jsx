import { 
    BrowserRouter as Router,
    Routes,
    Route,
    useLocation
} from "react-router-dom";
import React, { useEffect } from "react";
import Home from "../pages/Home";
import ChatRoom from "../pages/Chatroom";

const ScrollToTop = () => {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
};

function App(){
    return (
        <Router>
            <ScrollToTop />
            <Routes>
                <Route path="/" element={<Home />}></Route>
                <Route path="/chat-room/:roomId" element={<ChatRoom />}></Route>
            </Routes>
        </Router>
    )
}


export default App;
