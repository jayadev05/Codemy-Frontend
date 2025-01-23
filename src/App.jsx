import { Provider } from "react-redux";
import { store, persistor } from "../src/store/store";
import { PersistGate } from 'redux-persist/integration/react';
import { GoogleOAuthProvider } from "@react-oauth/google";
import { Toaster } from 'react-hot-toast';
import 'react-toastify/dist/ReactToastify.css';
import AppContent from './AppContent';

function App() {
  return (
    <Provider store={store}>
      <PersistGate loading={null} persistor={persistor}>
        <GoogleOAuthProvider clientId="232393055953-osjvrkcea9fl40u1ijn4imqj7u6vt8p1.apps.googleusercontent.com">
          <Toaster position="top-right"/>
          <AppContent />
        </GoogleOAuthProvider>
      </PersistGate>
    </Provider>
  );
}

export default App;
