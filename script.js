// Importações modulares do Firebase SDK (versão 11+)
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-auth.js";
import { getFirestore, collection, addDoc, doc, deleteDoc, query, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js";

// O código será executado quando o DOM estiver completamente carregado
document.addEventListener('DOMContentLoaded', () => {

    // --- VARIÁVEIS GLOBAIS E CONFIGURAÇÃO ---
    let db = null;
    let auth = null;
    let currentUserId = null;
    let isFirebaseInitialized = false;

    // Configuração do Firebase fornecida pelo utilizador
    // ESTE BLOCO É O MAIS IMPORTANTE
    const firebaseConfig = {
        apiKey: "AIzaSyCnFsX4MwdAR3yC0MAoK9x3II3UGt1DDng",
        authDomain: "ferramentasete.firebaseapp.com",
        projectId: "ferramentasete",
        storageBucket: "ferramentasete.firebasestorage.app",
        messagingSenderId: "436175488554",
        appId: "1:436175488554:web:6bb40da9db9c88674ca553"
    };

    const appId = (firebaseConfig && firebaseConfig.projectId)
        ? firebaseConfig.projectId
        : 'default-app-id';
    
    // --- FUNÇÕES AUXILIARES ---
    const getEl = (id) => document.getElementById(id);

    // --- MANIPULAÇÃO DO ESTADO DOS BOTÕES DE GUARDAR ---
    const saveButtons = [
        getEl('saveSludgeAgeData'),
        getEl('savePhysicalChemicalData'),
        getEl('saveOrganicLoadData')
    ];

    const setSaveButtonsState = (enabled) => {
        saveButtons.forEach(button => {
            if (button) {
                button.disabled = !enabled;
                if (enabled) {
                    button.classList.remove('opacity-50', 'cursor-not-allowed');
                    button.title = 'Guardar o resultado no histórico';
                } else {
                    button.classList.add('opacity-50', 'cursor-not-allowed');
                    button.title = 'A ligar à base de dados...';
                }
            }
        });
    };


    // --- INICIALIZAÇÃO DO FIREBASE ---
    if (firebaseConfig && firebaseConfig.apiKey) {
        try {
            const app = initializeApp(firebaseConfig);
            auth = getAuth(app);
            db = getFirestore(app);
            isFirebaseInitialized = true;
            console.log("Firebase SDK inicializado com sucesso.");

            // Observador de estado de autenticação
            onAuthStateChanged(auth, user => {
                if (user) {
                    currentUserId = user.uid;
                    getEl('userIdDisplay').textContent = `ID Anónimo: ${currentUserId.substring(0, 12)}...`;
                    setSaveButtonsState(true); // Ativa os botões
                    loadAllHistories();
                } else {
                    setSaveButtonsState(false); // Mantém os botões desativados
                    signInAnonymously(auth).catch(error => {
                        console.error("Erro no sign-in anónimo:", error);
                        currentUserId = 'local-fallback-id-' + crypto.randomUUID();
                        getEl('userIdDisplay').textContent = "DB Offline";
                    });
                }
            });

        } catch (e) {
            console.error("Erro fatal ao inicializar Firebase SDK:", e);
            getEl('userIdDisplay').textContent = `DB Offline (Erro)`;
            setSaveButtonsState(false);
        }
    } else {
        console.warn("Configuração do Firebase não encontrada. As funcionalidades de base de dados estão inativas.");
        getEl('userIdDisplay').textContent = `DB Offline (Sem Config)`;
        setSaveButtonsState(false);
    }


    // --- MANIPULAÇÃO DA UI (SEÇÕES) ---
    const sections = ['sludgeAgeSection', 'physicalChemicalSection', 'organicLoadSection', 'howItWorksSection'];
    const navButtons = {
        'sludgeAgeSection': 'showSludgeAge',
        'physicalChemicalSection': 'showPhysicalChemical',
        'organicLoadSection': 'showOrganicLoad',
        'howItWorksSection': 'showHowItWorks'
    };

    const showSection = (targetId) => {
        sections.forEach(id => {
            const section = getEl(id);
            if (id === targetId) {
                section.classList.remove('hidden-section');
                section.classList.add('visible-section');
            } else {
                section.classList.remove('visible-section');
                section.classList.add('hidden-section');
            }
        });
        Object.values(navButtons).forEach(btnId => getEl(btnId).classList.remove('active-nav-button'));
        getEl(navButtons[targetId]).classList.add('active-nav-button');
    };
    
    // Anexar eventos aos botões de navegação
    Object.entries(navButtons).forEach(([sectionId, btnId]) => {
        getEl(btnId).addEventListener('click', () => showSection(sectionId));
    });


    // --- MAIS FUNÇÕES AUXILIARES ---
    const getVal = (id) => parseFloat(getEl(id).value);
    
    // Função para obter classe de cor baseada no valor e tipo
    const getResultColorClass = (value, type) => {
        switch (type) {
            case 'sludgeAge':
                if (value >= 5 && value <= 15) return 'result-positive';
                if ((value > 15 && value <= 20) || (value < 5 && value >= 0)) return 'result-warning';
                return 'result-negative';
            case 'efficiency':
                if (value >= 80) return 'result-positive';
                if (value >= 60) return 'result-warning';
                return 'result-negative';
            default: return '';
        }
    };
    
    // Esconder e limpar ecrãs de erro
    const hideError = (id) => {
        const el = getEl(id);
        el.classList.add('hidden');
        el.textContent = '';
    }

    // Mostrar ecrãs de erro
    const showError = (id, message) => {
        const el = getEl(id);
        el.textContent = message;
        el.classList.remove('hidden');
    }


    // --- LÓGICA DAS CALCULADORAS ---

    // 1. Idade do Lodo
    const calculateSludgeAge = () => {
        hideError('sludgeAgeErrorDisplay');
        const inputs = {
            aerationTankVolume: getVal('aerationTankVolume'),
            aerationTankVSS: getVal('aerationTankVSS'),
            discardFlowRate: getVal('discardFlowRate'),
            discardVSS: getVal('discardVSS'),
            effluentFlowRate: getVal('effluentFlowRate'),
            effluentVSS: getVal('effluentVSS'),
        };

        if (Object.values(inputs).some(isNaN) || Object.values(inputs).some(v => v < 0)) {
            showError('sludgeAgeErrorDisplay', 'Por favor, preencha todos os campos com valores numéricos positivos válidos.');
            return null;
        }

        const massInTank = inputs.aerationTankVolume * 1000 * inputs.aerationTankVSS;
        const massDiscarded = inputs.discardFlowRate * 1440 * inputs.discardVSS;
        const massInEffluent = inputs.effluentFlowRate * 1000 * inputs.effluentVSS;
        const denominator = massDiscarded + massInEffluent;
        
        if (denominator === 0) {
            showError('sludgeAgeErrorDisplay', 'A soma das massas de SSV removidas é zero. Verifique os valores.');
            return null;
        }

        const calculatedISR = massInTank / denominator;
        const resultSpan = getEl('sludgeAgeResult');
        resultSpan.textContent = `${calculatedISR.toFixed(2)} dias`;
        resultSpan.className = `text-2xl font-bold ${getResultColorClass(calculatedISR, 'sludgeAge')}`;
        getEl('sludgeAgeResultDisplay').classList.remove('hidden');
        return { ...inputs, calculatedISR };
    };

    // 2. Eficiência Físico-Química
    const calculatePhysicalChemical = () => {
        hideError('phyChemErrorDisplay');
        const inputs = {
            initialTurbidity: getVal('phyChemInitialTurbidity'),
            finalTurbidity: getVal('phyChemFinalTurbidity'),
            initialColor: getVal('phyChemInitialColor'),
            finalColor: getVal('phyChemFinalColor'),
            idealDosage: getVal('phyChemIdealDosage'),
            etaFlowRate: getVal('phyChemEtaFlowRate'),
            dosageUnit: getEl('phyChemDosageUnit').value
        };

        if (Object.values(inputs).slice(0, 6).some(isNaN) || Object.values(inputs).some(v => v < 0)) {
            showError('phyChemErrorDisplay', 'Por favor, preencha todos os campos com valores numéricos positivos.');
            return null;
        }

        const turbidityEfficiency = inputs.initialTurbidity > 0 ? ((inputs.initialTurbidity - inputs.finalTurbidity) / inputs.initialTurbidity) * 100 : (inputs.finalTurbidity === 0 ? 100 : 0);
        const colorEfficiency = inputs.initialColor > 0 ? ((inputs.initialColor - inputs.finalColor) / inputs.initialColor) * 100 : (inputs.finalColor === 0 ? 100 : 0);
        const dailyDosage = inputs.dosageUnit === 'mg/L' ? (inputs.idealDosage * inputs.etaFlowRate) / 1000 : inputs.idealDosage * inputs.etaFlowRate;
        const dailyDosageUnit = inputs.dosageUnit === 'mg/L' ? 'kg/dia' : 'L/dia';
        
        getEl('phyChemTurbidityEfficiency').textContent = `${turbidityEfficiency.toFixed(2)} %`;
        getEl('phyChemColorEfficiency').textContent = `${colorEfficiency.toFixed(2)} %`;
        getEl('phyChemDailyDosage').textContent = `${dailyDosage.toFixed(2)} ${dailyDosageUnit}`;
        getEl('phyChemResultDisplay').classList.remove('hidden');
        return { ...inputs, turbidityEfficiency, colorEfficiency, dailyDosage, dailyDosageUnit };
    };

    // 3. Carga Orgânica
    const calculateOrganicLoad = () => {
        hideError('organicLoadErrorDisplay');
        const inputs = {
            influentConcentration: getVal('organicInfluentConcentration'),
            effluentConcentration: getVal('organicEffluentConcentration'),
            flowRate: getVal('organicLoadFlowRate')
        };
        
        if (Object.values(inputs).some(isNaN) || Object.values(inputs).some(v => v < 0)) {
            showError('organicLoadErrorDisplay', 'Por favor, preencha todos os campos com valores numéricos positivos.');
            return null;
        }

        const influentLoad = (inputs.influentConcentration * inputs.flowRate) / 1000;
        const effluentLoad = (inputs.effluentConcentration * inputs.flowRate) / 1000;
        const efficiency = influentLoad > 0 ? ((influentLoad - effluentLoad) / influentLoad) * 100 : 0;

        getEl('influentOrganicLoadResult').textContent = `${influentLoad.toFixed(2)} kg/dia`;
        getEl('effluentOrganicLoadResult').textContent = `${effluentLoad.toFixed(2)} kg/dia`;
        getEl('organicLoadEfficiencyResult').textContent = `${efficiency.toFixed(2)} %`;
        getEl('organicLoadEfficiencyResult').className = `font-semibold ${getResultColorClass(efficiency, 'efficiency')}`;
        getEl('organicLoadResultDisplay').classList.remove('hidden');
        return { ...inputs, influentLoad, effluentLoad, efficiency };
    };


    // --- DADOS E HISTÓRICO (FIRESTORE) ---
    const saveData = async (collectionName, data) => {
        if (!isFirebaseInitialized || !db || !currentUserId) {
            alert("A ligação à base de dados falhou. Não foi possível guardar os dados.");
            return;
        }
        try {
            await addDoc(collection(db, `artifacts/${appId}/users/${currentUserId}/${collectionName}`), { ...data, timestamp: new Date() });
            alert("Dados guardados com sucesso!");
        } catch (e) {
            console.error("Erro ao guardar dados: ", e);
            alert(`Erro ao guardar dados: ${e.message}`);
        }
    };
    
    const deleteData = async (collectionName, docId) => {
         if (!isFirebaseInitialized || !db || !currentUserId) {
            alert("A ligação à base de dados falhou. Não foi possível excluir.");
            return;
        }
        try {
            await deleteDoc(doc(db, `artifacts/${appId}/users/${currentUserId}/${collectionName}`, docId));
        } catch (e) {
             console.error("Erro ao excluir dados: ", e);
             alert(`Erro ao excluir dados: ${e.message}`);
        }
    };

    // --- MODAL DE CONFIRMAÇÃO ---
    const confirmModal = getEl('confirmModal');
    const confirmModalOk = getEl('confirmModalOk');
    const confirmModalCancel = getEl('confirmModalCancel');

    const showConfirmModal = (onConfirm) => {
        confirmModal.classList.add('flex');
        confirmModal.classList.remove('hidden');

        // Remove listeners antigos para evitar chamadas múltiplas
        const newOk = confirmModalOk.cloneNode(true);
        confirmModalOk.parentNode.replaceChild(newOk, confirmModalOk);
        
        newOk.addEventListener('click', () => {
            onConfirm();
            hideConfirmModal();
        });
    };
    
    const hideConfirmModal = () => {
        confirmModal.classList.add('hidden');
        confirmModal.classList.remove('flex');
    };
    
    confirmModalCancel.addEventListener('click', hideConfirmModal);
    

    // --- CARREGAMENTO E EXIBIÇÃO DO HISTÓRICO ---
    const displayHistory = (elementId, collectionName, historyData, headers, dataRenderer, loadFunction) => {
        const historyElement = getEl(elementId);
        if (historyData.length === 0) {
            historyElement.innerHTML = `<p class="text-center text-sm text-slate-500 py-4">Nenhum histórico guardado.</p>`;
            return;
        }

        historyElement.innerHTML = `
            <h3 class="text-lg font-semibold text-slate-700 p-4 border-b border-slate-200">Histórico de Cálculos</h3>
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>Data</th>
                            ${headers.map(h => `<th>${h}</th>`).join('')}
                            <th class="text-right">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${historyData.map(entry => `
                            <tr>
                                <td>${new Date(entry.timestamp.toDate()).toLocaleString('pt-BR')}</td>
                                ${dataRenderer(entry)}
                                <td class="text-right space-x-2">
                                    <button data-id="${entry.id}" class="load-btn">Carregar</button>
                                    <button data-id="${entry.id}" class="delete-btn">Excluir</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

        historyElement.querySelectorAll('.load-btn').forEach(btn => {
            btn.addEventListener('click', () => loadFunction(historyData.find(d => d.id === btn.dataset.id)));
        });

        historyElement.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                showConfirmModal(() => deleteData(collectionName, btn.dataset.id));
            });
        });
    };

    const setupHistoryListener = (collectionName, elementId, headers, dataRenderer, loadFunction) => {
        if (!isFirebaseInitialized || !db || !currentUserId) {
            getEl(elementId).innerHTML = `<p class="text-center text-sm text-slate-500 py-4">Base de dados indisponível.</p>`;
            return;
        }
        const q = query(collection(db, `artifacts/${appId}/users/${currentUserId}/${collectionName}`), orderBy("timestamp", "desc"));
        onSnapshot(q, (snapshot) => {
            const historyData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            displayHistory(elementId, collectionName, historyData, headers, dataRenderer, loadFunction);
        }, (error) => {
            console.error(`Erro ao carregar histórico de ${collectionName}:`, error);
            getEl(elementId).innerHTML = `<p class="text-center text-sm text-red-500 py-4">Erro ao carregar histórico.</p>`;
        });
    };

    const loadAllHistories = () => {
        // Idade do Lodo
        setupHistoryListener('sludgeAgeCalculations', 'sludgeAgeHistory', ['ISR (dias)'],
            (entry) => `<td class="${getResultColorClass(entry.calculatedISR, 'sludgeAge')}">${entry.calculatedISR.toFixed(2)}</td>`,
            (entry) => {
                getEl('aerationTankVolume').value = entry.aerationTankVolume || '';
                getEl('aerationTankVSS').value = entry.aerationTankVSS || '';
                getEl('discardFlowRate').value = entry.discardFlowRate || '';
                getEl('discardVSS').value = entry.discardVSS || '';
                getEl('effluentFlowRate').value = entry.effluentFlowRate || '';
                getEl('effluentVSS').value = entry.effluentVSS || '';
                calculateSludgeAge();
            }
        );

        // Físico-Químico
        setupHistoryListener('physicalChemicalCalculations', 'physicalChemicalHistory', ['Efic. Turb. (%)', 'Efic. Cor (%)'],
            (entry) => `<td class="${getResultColorClass(entry.turbidityEfficiency, 'efficiency')}">${entry.turbidityEfficiency.toFixed(2)}</td>
                        <td class="${getResultColorClass(entry.colorEfficiency, 'efficiency')}">${entry.colorEfficiency.toFixed(2)}</td>`,
            (entry) => {
                getEl('phyChemInitialTurbidity').value = entry.initialTurbidity || '';
                getEl('phyChemFinalTurbidity').value = entry.finalTurbidity || '';
                getEl('phyChemInitialColor').value = entry.initialColor || '';
                getEl('phyChemFinalColor').value = entry.finalColor || '';
                getEl('phyChemIdealDosage').value = entry.idealDosage || '';
                getEl('phyChemDosageUnit').value = entry.dosageUnit || 'mg/L';
                getEl('phyChemEtaFlowRate').value = entry.etaFlowRate || '';
                calculatePhysicalChemical();
            }
        );

        // Carga Orgânica
        setupHistoryListener('organicLoadCalculations', 'organicLoadHistory', ['Carga Afluente (kg/dia)', 'Eficiência (%)'],
            (entry) => `<td>${entry.influentLoad.toFixed(2)}</td>
                        <td class="${getResultColorClass(entry.efficiency, 'efficiency')}">${entry.efficiency.toFixed(2)}</td>`,
            (entry) => {
                getEl('organicInfluentConcentration').value = entry.influentConcentration || '';
                getEl('organicEffluentConcentration').value = entry.effluentConcentration || '';
                getEl('organicLoadFlowRate').value = entry.flowRate || '';
                calculateOrganicLoad();
            }
        );
    };

    // --- ANEXAR EVENT LISTENERS AOS BOTÕES DE AÇÃO ---
    // Calcular
    getEl('calculateSludgeAgeButton').addEventListener('click', calculateSludgeAge);
    getEl('calculatePhysicalChemicalButton').addEventListener('click', calculatePhysicalChemical);
    getEl('calculateOrganicLoadButton').addEventListener('click', calculateOrganicLoad);
    
    // Guardar
    getEl('saveSludgeAgeData').addEventListener('click', () => { const data = calculateSludgeAge(); if (data) saveData('sludgeAgeCalculations', data); });
    getEl('savePhysicalChemicalData').addEventListener('click', () => { const data = calculatePhysicalChemical(); if (data) saveData('physicalChemicalCalculations', data); });
    getEl('saveOrganicLoadData').addEventListener('click', () => { const data = calculateOrganicLoad(); if (data) saveData('organicLoadCalculations', data); });


    // --- INICIALIZAÇÃO ---
    setSaveButtonsState(false); // Desativa os botões ao iniciar
    showSection('sludgeAgeSection');
});
