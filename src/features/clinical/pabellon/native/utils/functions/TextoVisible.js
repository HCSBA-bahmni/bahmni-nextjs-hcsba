export const limpiarTextoVisible = (valor, fallback = '') => {
    if (valor === null || valor === undefined) return fallback;
    const texto = String(valor).trim();
    if (!texto || texto.toUpperCase() === 'NULL') return fallback;
    return texto;
};

export const armarNombreCompleto = (...partes) => (
    partes
        .map((parte) => limpiarTextoVisible(parte))
        .flatMap((parte) => parte.split(/\s+/).filter((token) => token.toUpperCase() !== 'NULL'))
        .filter(Boolean)
        .join(' ')
);

export const getDataPacienteSnapshot = (registro) => (
    registro?.data_persona
    || registro?.data_paciente
    || registro?.cirugia?.data_persona
    || registro?.cirugia?.data_paciente
    || null
);

export const getNombrePacienteSnapshot = (registro, {incluirFicha = true} = {}) => {
    const dataPaciente = getDataPacienteSnapshot(registro);
    const nombreSnapshot = dataPaciente
        ? armarNombreCompleto(dataPaciente.nombres, dataPaciente.apellido_paterno, dataPaciente.apellido_materno)
        : '';
    const nombre = nombreSnapshot;
    if (nombre && incluirFicha && registro?.registro_por_ficha) return `${nombre} · Ficha`;
    return nombre;
};
