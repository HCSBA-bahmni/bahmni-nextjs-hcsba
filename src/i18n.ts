import i18n from "i18next";
import { initReactI18next } from "react-i18next";

void i18n.use(initReactI18next).init({
  lng: "es", fallbackLng: "es", interpolation: { escapeValue: false },
  resources: { es: { translation: {
    signIn: "Ingresar", username: "Usuario", password: "Contraseña", otp: "Código de verificación",
    location: "Ubicación", continue: "Continuar", logout: "Cerrar sesión", registration: "Registro",
    registrationPrintAction: "Imprimir", registrationSaveAction: "Guardar paciente",
  } }, en: { translation: { registrationPrintAction: "Print", registrationSaveAction: "Save patient" } } },
});

export default i18n;
