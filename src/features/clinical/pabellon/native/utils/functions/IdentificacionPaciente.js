const LABELS = {
    rut: 'RUT',
    pasaporte: 'Pasaporte',
    cedula: 'Cédula',
    ficha: 'N° ficha',
};

const buscarEnPerIdentif = (persona, tipo) => {
    const identificaciones = Array.isArray(persona?.per_identif) ? persona.per_identif : [];
    return identificaciones.find(item => item?.[tipo])?.[tipo] || '';
};

const rutDesdePersona = (persona) => {
    const run = Number(persona?.run_persona);
    const dv = persona?.dv_persona;
    return run > 0 && dv ? `${run}-${dv}` : '';
};

export const getIdentificacionPaciente = (registro = {}) => {
    const data = registro?.data_persona || registro?.data_paciente || registro || {};
    const persona = registro?.persona || {};
    const valores = {
        rut: data?.rut || rutDesdePersona(persona),
        pasaporte: data?.pasaporte || buscarEnPerIdentif(persona, 'pasaporte'),
        cedula: data?.cedula || buscarEnPerIdentif(persona, 'cedula'),
        ficha: data?.ficha || buscarEnPerIdentif(persona, 'ficha'),
    };

    let tipo = String(data?.tipo_identificacion || '').toLowerCase();
    if (!LABELS[tipo] || !valores[tipo]) {
        tipo = ['rut', 'pasaporte', 'cedula', 'ficha'].find(key => valores[key]) || '';
    }

    const valor = tipo ? valores[tipo] : '';
    const label = LABELS[tipo] || 'Identificación';
    return {
        tipo,
        label,
        valor,
        texto: valor ? `${label}: ${valor}` : 'Sin identificación',
        valores,
    };
};

export const getLabelIdentificacion = (tipo) => LABELS[tipo] || 'Identificación';
