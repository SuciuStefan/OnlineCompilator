/* ============================================================
   script.js — CC101 Code Compiler
   Structură: Constante → Init editor → Model date → Compilare
   → Salvare → Butoane split → Panouri colapsabile → Render
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {

    // ── DEFINIȚIILE LIMBAJELOR ───────────────────────────────────
    // Fiecare limbaj știe: iconița sa, extensia, modul CodeMirror,
    // fișierul implicit și codul Hello World corespunzător.
    const LIMBAJE = {
        cpp: {
            id: 'cpp', eticheta: 'C++', icona: 'devicon-cplusplus-plain',
            extensie: '.cpp', modCM: 'text/x-c++src', fisierPrincipal: 'main.cpp',
            hello:
`#include <iostream>
using namespace std;
int main() {
    cout << "Hello, World!" << endl;
    return 0;
}`,
        },
        c: {
            id: 'c', eticheta: 'C', icona: 'devicon-c-plain',
            extensie: '.c', modCM: 'text/x-csrc', fisierPrincipal: 'main.c',
            hello:
`#include <stdio.h>
int main() {
    printf("Hello, World!\\n");
    return 0;
}`,
        },
        python: {
            id: 'python', eticheta: 'Python', icona: 'devicon-python-plain',
            extensie: '.py', modCM: 'text/x-python', fisierPrincipal: 'main.py',
            hello: `print("Hello, World!")`,
        },
        java: {
            id: 'java', eticheta: 'Java', icona: 'devicon-java-plain',
            extensie: '.java', modCM: 'text/x-java', fisierPrincipal: 'Main.java',
            hello:
`public class Main {
    public static void main(String[] args) {
        System.out.println("Hello, World!");
    }
}`,
        },
        rust: {
            id: 'rust', eticheta: 'Rust', icona: 'devicon-rust-plain',
            extensie: '.rs', modCM: 'text/x-rustsrc', fisierPrincipal: 'main.rs',
            hello:
`fn main() {
    println!("Hello, World!");
}`,
        },
    };

    // Limbajul curent selectat — implicit C++
    let limbajCurent = LIMBAJE.cpp;

    // ── INIȚIALIZARE CODEMIRROR ──────────────────────────────────
    // CodeMirror înlocuiește textarea-ul cu un editor avansat
    const sursa = document.getElementById('sursa-editor');
    if (!sursa) { console.error('Textarea-ul editorului nu a fost găsit!'); return; }

    const editor = CodeMirror.fromTextArea(sursa, {
        lineNumbers:    true,       // numerotarea liniilor
        mode:           limbajCurent.modCM,
        theme:          'dracula',
        indentUnit:     4,
        tabSize:        4,
        indentWithTabs: true,
        lineWrapping:   true,
    });
    editor.setSize('100%', '96%');

    // Referințe DOM frecvent folosite
    const zonaOutput     = document.getElementById('zona-output');
    const inputStdin     = document.getElementById('text-stdin');
    const containerTaburi = document.getElementById('container-taburi');
    const listaFisiere   = document.getElementById('lista-fisiere');
    const inputFisier    = document.getElementById('input-fisier');
    const butonUpload    = document.getElementById('buton-upload-fisier');

    // ── MODELUL DE DATE AL PROIECTULUI ──────────────────────────
    // dateiFisiere → Map<numeFisier, continut>  — toate fișierele din proiect
    // tabulriDeschise → Set<numeFisier>         — doar fișierele cu tab activ
    // Închiderea unui tab NU șterge fișierul din sidebar/dateiFisiere.
    // Ștergerea din sidebar șterge din ambele structuri.
    const dateiFisiere     = new Map();
    const tabluriDeschise  = new Set();
    let   fisierActiv      = limbajCurent.fisierPrincipal;

    // Pornim cu fișierul implicit al limbajului curent
    dateiFisiere.set(limbajCurent.fisierPrincipal, limbajCurent.hello);
    tabluriDeschise.add(limbajCurent.fisierPrincipal);
    editor.setValue(limbajCurent.hello);

    // ── COMPILARE ────────────────────────────────────────────────
    // Trimite codul la serverul local (port 3000) și afișează rezultatul.
    // mode: 'fisier'  → compilează doar fișierul activ din editor
    // mode: 'proiect' → compilează toate sursele din proiect împreună
    function compileaza(mode) {
        // Salvăm conținutul editorului în model înainte de orice
        if (fisierActiv) dateiFisiere.set(fisierActiv, editor.getValue());

        const stdin = inputStdin ? inputStdin.value : '';

        // Afișăm un mesaj de așteptare în zona de output
        zonaOutput.innerHTML = '';
        adaugaOutput(
            mode === 'proiect'
                ? `Compilare proiect (${limbajCurent.eticheta})... ⏳`
                : `Compilare fișier activ (${limbajCurent.eticheta})... ⏳`,
            'astept'
        );

        let corpCerere;

        if (mode === 'proiect') {
            // Colectăm doar fișierele cu extensia limbajului curent
            const fisiereSursa = [];
            dateiFisiere.forEach((continut, numeFisier) => {
                if (numeFisier.endsWith(limbajCurent.extensie))
                    fisiereSursa.push({ name: numeFisier, content: continut });
            });

            if (fisiereSursa.length === 0) {
                zonaOutput.innerHTML = '';
                adaugaOutput(`Nu există fișiere ${limbajCurent.extensie} în proiect.`, 'eroare');
                return;
            }
            corpCerere = JSON.stringify({ language: limbajCurent.id, files: fisiereSursa, stdin });
        } else {
            corpCerere = JSON.stringify({ language: limbajCurent.id, code: editor.getValue(), stdin });
        }

        fetch('http://127.0.0.1:3000/compile', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    corpCerere,
        })
        .then(r => { if (!r.ok) throw new Error(`Eroare server: ${r.status}`); return r.json(); })
        .then(date => {
            zonaOutput.innerHTML = '';
            // Detectăm dacă output-ul conține mesaje de eroare
            const esteEroare = /error:|Eroare|⏱/i.test(date.output);
            adaugaOutput(date.output, esteEroare ? 'eroare' : 'succes');
        })
        .catch(err => {
            console.error(err);
            zonaOutput.innerHTML = '';
            adaugaOutput('Eroare de conexiune! Verifică că server.js rulează (F12 pentru detalii).', 'eroare');
        });
    }

    // Creează un bloc <pre> colorat și îl adaugă în zona de output
    function adaugaOutput(text, tip) {
        const bloc = document.createElement('pre');
        bloc.className   = `bloc-output ${tip}`;
        bloc.textContent = text;
        zonaOutput.appendChild(bloc);
    }

    // ── SALVARE ──────────────────────────────────────────────────
    // mode: 'fisier'  → descarcă fișierul activ
    // mode: 'proiect' → împachetează tot în .zip cu JSZip și descarcă
    function salveaza(mode) {
        if (fisierActiv) dateiFisiere.set(fisierActiv, editor.getValue());

        if (mode === 'fisier') {
            descarcaBlob(fisierActiv || 'untitled', dateiFisiere.get(fisierActiv) || '');
        } else {
            const zip = new JSZip();
            dateiFisiere.forEach((continut, nume) => zip.file(nume, continut));
            zip.generateAsync({ type: 'blob' })
               .then(blob => descarcaBlob('proiect.zip', blob, true));
        }
    }

    // Creează un link temporar pentru descărcarea unui fișier
    function descarcaBlob(numeFisier, date, esteBlob = false) {
        const blob = esteBlob ? date : new Blob([date], { type: 'text/plain' });
        const url  = URL.createObjectURL(blob);
        const link = Object.assign(document.createElement('a'), { href: url, download: numeFisier });
        link.click();
        URL.revokeObjectURL(url);
    }

    // ── BUTOANE SPLIT ────────────────────────────────────────────
    // Fiecare buton split are: acțiunea implicită (click principal)
    // și un meniu extins (click pe săgeată). Clicul în afară închide meniurile.
    function initButonSplit(idPrincipal, idSageata, idDropdown, actiuneImplicita) {
        const btnPrincipal = document.getElementById(idPrincipal);
        const btnSageata   = document.getElementById(idSageata);
        const dropdown     = document.getElementById(idDropdown);

        // Click pe butonul principal → acțiunea implicită (fișier activ)
        btnPrincipal.addEventListener('click', () => actiuneImplicita());

        // Click pe săgeată → deschide/închide dropdown-ul
        btnSageata.addEventListener('click', e => {
            e.stopPropagation(); // nu propagăm spre document (ar închide imediat)
            const eraDeschi = dropdown.classList.contains('deschis');
            inchideToateDropdown();
            if (!eraDeschi) dropdown.classList.add('deschis');
        });

        // Click pe o opțiune din dropdown → execută acțiunea corespunzătoare
        dropdown.querySelectorAll('.optiune-dropdown').forEach(optiune => {
            optiune.addEventListener('click', () => {
                const actiune = optiune.dataset.actiune;
                inchideToateDropdown();
                if (actiune === 'ruleaza-fisier')  compileaza('fisier');
                if (actiune === 'ruleaza-proiect') compileaza('proiect');
                if (actiune === 'salveaza-fisier') salveaza('fisier');
                if (actiune === 'salveaza-proiect') salveaza('proiect');
            });
        });
    }

    // Click oriunde pe pagină → închide toate dropdown-urile deschise
    function inchideToateDropdown() {
        document.querySelectorAll('.meniu-dropdown.deschis')
                .forEach(d => d.classList.remove('deschis'));
    }
    document.addEventListener('click', inchideToateDropdown);

    initButonSplit('buton-salveaza', 'sageata-salvare', 'dropdown-salvare', () => salveaza('fisier'));
    initButonSplit('buton-ruleaza',  'sageata-rulare',  'dropdown-rulare',  () => compileaza('fisier'));

    // ── PANOURI COLAPSABILE ──────────────────────────────────────
    // Funcție generică: toggle pentru orice pereche titlu+panou+săgeată.
    // Returnează starea curentă (deschis/închis) pentru a putea fi inițializat.
    function initPanouColapsabil(idToggle, idPanou, idSageata, deschisImplicit = false) {
        const toggle = document.getElementById(idToggle);
        const panou  = document.getElementById(idPanou);
        const sageata = document.getElementById(idSageata);
        let esteDeschi = deschisImplicit;

        // Dacă e deschis implicit, setăm înălțimea și rotim săgeata
        if (esteDeschi) {
            panou.style.maxHeight = panou.scrollHeight + 'px';
            if (sageata) sageata.style.transform = 'rotate(0deg)';
        }

        toggle.addEventListener('click', () => {
            esteDeschi = !esteDeschi;
            panou.style.maxHeight  = esteDeschi ? panou.scrollHeight + 'px' : '0';
            if (sageata) sageata.style.transform = esteDeschi ? 'rotate(180deg)' : 'rotate(0deg)';
        });

        // Returnăm un getter pentru starea panoului (folosit de renderSidebar)
        return () => esteDeschi;
    }

    // Inițializăm toate panourile — Files deschis implicit, restul închise
    const esteDeschisFisiere = initPanouColapsabil('toggle-fisiere', 'panou-fisiere', 'sageata-fisiere', false);
    initPanouColapsabil('toggle-limbaj', 'panou-limbaj',  'sageata-limbaj');
    initPanouColapsabil('toggle-setari', 'panou-setari',  'sageata-setari');

    // ── PANOUL STDIN ─────────────────────────────────────────────
    // Colapsabil separat (nu e în sidebar) — închis implicit
    const baraStin  = document.getElementById('bara-stdin');
    const corpStdin = document.getElementById('corp-stdin');
    const sagStdin  = document.getElementById('sageata-stdin');
    let stdinDeschi = false;

    baraStin.addEventListener('click', () => {
        stdinDeschi = !stdinDeschi;
        corpStdin.style.maxHeight = stdinDeschi ? corpStdin.scrollHeight + 'px' : '0';
        sagStdin.style.transform  = stdinDeschi ? 'rotate(180deg)' : 'rotate(0deg)';
        // Focus automat pe textarea când se deschide — utilizatorul poate tasta imediat
        if (stdinDeschi) setTimeout(() => inputStdin.focus(), 150);
    });

    // ── SELECTAREA LIMBAJULUI ────────────────────────────────────
    const iconaLimbaj    = document.getElementById('icona-limbaj');
    const containerLimbaj = document.getElementById('optiuni-limbaj');
    const panouLimbaj    = document.getElementById('panou-limbaj');

    // Construiește butoanele de limbaj în sidebar
    function construiesteOptiuniLimbaj() {
        containerLimbaj.innerHTML = '';
        Object.values(LIMBAJE).forEach(lang => {
            const btn = document.createElement('button');
            btn.className   = `buton-limbaj ${lang.id === limbajCurent.id ? 'activ' : ''}`;
            btn.dataset.lang = lang.id;
            btn.innerHTML   = `<i class="${lang.icona}"></i><span>${lang.eticheta}</span><small>${lang.extensie}</small>`;
            btn.addEventListener('click', () => schimbaLimbaj(lang.id));
            containerLimbaj.appendChild(btn);
        });
    }

    // Schimbă limbajul: șterge fișierul principal vechi, creează unul nou
    function schimbaLimbaj(idLimbaj) {
        if (idLimbaj === limbajCurent.id) return;

        // Salvăm conținutul curent înainte de schimbare
        if (fisierActiv) dateiFisiere.set(fisierActiv, editor.getValue());

        const limbajVechi = limbajCurent;
        const limbajNou   = LIMBAJE[idLimbaj];

        // Ștergem fișierul implicit al limbajului vechi (nu și fișierele uploadate)
        if (dateiFisiere.has(limbajVechi.fisierPrincipal)) {
            dateiFisiere.delete(limbajVechi.fisierPrincipal);
            tabluriDeschise.delete(limbajVechi.fisierPrincipal);
        }

        // Adăugăm fișierul implicit al limbajului nou cu Hello World
        dateiFisiere.set(limbajNou.fisierPrincipal, limbajNou.hello);
        tabluriDeschise.add(limbajNou.fisierPrincipal);

        limbajCurent = limbajNou;
        fisierActiv  = limbajNou.fisierPrincipal;

        // Actualizăm editorul cu noul mod de syntax highlighting
        editor.setOption('mode', limbajNou.modCM);
        editor.setValue(limbajNou.hello);
        iconaLimbaj.className = limbajNou.icona;

        // Curățăm stdin-ul — input-ul vechi nu mai e relevant
        if (inputStdin) inputStdin.value = '';

        construiesteOptiuniLimbaj();
        randeazaTaburi();
        randeazaFisiereSidebar();

        // Recalculăm înălțimea panoului de limbaj după rebuild
        if (panouLimbaj.style.maxHeight !== '0px')
            panouLimbaj.style.maxHeight = panouLimbaj.scrollHeight + 'px';
    }

    construiesteOptiuniLimbaj();

    // ── SETĂRI FONT ──────────────────────────────────────────────
    // Aplicăm fontul pe containerele principale; CodeMirror e actualizat separat
    const zoneFontabile = [
        document.getElementById('bara-sus'),
        document.getElementById('zona-editor'),
        document.getElementById('panou-jos'),
        document.getElementById('zona-output'),  // font + marime explicite
        document.getElementById('text-stdin'),   // font + marime explicite
    ];
    const sidebarEl = document.getElementById('bara-laterala');

    function aplicaFont(valoareFont) {
        zoneFontabile.forEach(el => { if (el) el.style.fontFamily = valoareFont; });
        if (sidebarEl) sidebarEl.style.fontFamily = valoareFont;
        editor.getWrapperElement().style.fontFamily = valoareFont;
        editor.refresh(); // CodeMirror trebuie notificat manual la schimbarea fontului
    }

    document.querySelectorAll('.buton-font').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.buton-font').forEach(b => b.classList.remove('activ'));
            btn.classList.add('activ');
            aplicaFont(btn.dataset.font);
        });
    });

    // ── SETĂRI MĂRIME FONT ───────────────────────────────────────
    const sliderMarime  = document.getElementById('slider-marime');
    const afisajMarime  = document.getElementById('afisaj-marime');

    function aplicaMarime(valoare) {
        const n = parseInt(valoare, 10);
        zoneFontabile.forEach(el => { if (el) el.style.fontSize = n + 'px'; });
        editor.getWrapperElement().style.fontSize = n + 'px';
        editor.refresh();
        afisajMarime.textContent = n + 'px';

        // Sidebar-ul scalează cu 50% față de restul — evităm text prea mare în meniu
        if (sidebarEl) {
            const factor = (13 + (n - 13) * 0.5) / 13;
            sidebarEl.style.setProperty('--scale', factor);
        }
    }
    sliderMarime.addEventListener('input', () => aplicaMarime(sliderMarime.value));

    // ── SIDEBAR — TOGGLE RESTRÂNGERE ─────────────────────────────
    document.getElementById('buton-restrânge').addEventListener('click', () => {
        document.getElementById('container-principal').classList.toggle('meniu-inchis');
    });

    // ── UPLOAD FIȘIERE ───────────────────────────────────────────
    if (butonUpload && inputFisier) {
        butonUpload.addEventListener('click', () => inputFisier.click());
        inputFisier.addEventListener('change', e => {
            Array.from(e.target.files).forEach(fisier => {
                const cititor = new FileReader();
                cititor.onload = ev => adaugaFisier(fisier.name, ev.target.result);
                cititor.readAsText(fisier);
            });
            inputFisier.value = ''; // resetăm pentru a permite re-selectarea aceluiași fișier
        });
    }

    // ── OPERAȚIUNI CU FIȘIERE ─────────────────────────────────────

    // Adaugă un fișier nou în proiect, cu deduplicare automată a numelui
    function adaugaFisier(numeFisier, continut) {
        let numeUnic = numeFisier;
        let n = 1;
        while (dateiFisiere.has(numeUnic)) {
            const punct = numeFisier.lastIndexOf('.');
            const baza  = punct >= 0 ? numeFisier.slice(0, punct) : numeFisier;
            const ext   = punct >= 0 ? numeFisier.slice(punct)    : '';
            numeUnic = `${baza}_${n}${ext}`;
            n++;
        }
        dateiFisiere.set(numeUnic, continut);
        tabluriDeschise.add(numeUnic);
        deschideFisier(numeUnic);
        randeazaFisiereSidebar();
    }

    // Deschide un fișier în editor (adaugă tab dacă nu există deja)
    function deschideFisier(numeFisier) {
        // Salvăm conținutul fișierului activ curent înainte de a schimba
        if (fisierActiv && dateiFisiere.has(fisierActiv))
            dateiFisiere.set(fisierActiv, editor.getValue());

        if (!tabluriDeschise.has(numeFisier)) tabluriDeschise.add(numeFisier);
        fisierActiv = numeFisier;
        editor.setValue(dateiFisiere.get(numeFisier));
        randeazaTaburi();
        randeazaFisiereSidebar();
    }

    // Închide un tab fără a șterge fișierul din proiect
    function inchideTab(numeFisier, e) {
        e.stopPropagation();
        if (fisierActiv === numeFisier) dateiFisiere.set(numeFisier, editor.getValue());
        tabluriDeschise.delete(numeFisier);

        if (tabluriDeschise.size === 0) { reseteazaImplicit(); return; }

        // Dacă am închis tab-ul activ, mutăm focusul pe primul disponibil
        if (fisierActiv === numeFisier) {
            const urmator = tabluriDeschise.values().next().value;
            fisierActiv = urmator;
            editor.setValue(dateiFisiere.get(urmator));
        }
        randeazaTaburi();
        randeazaFisiereSidebar();
    }

    // Șterge un fișier complet din proiect (sidebar + tab)
    function stergeFisier(numeFisier) {
        if (!confirm(`Ești sigur că vrei să ștergi "${numeFisier}" din proiect?\nAceastă acțiune este ireversibilă.`)) return;

        dateiFisiere.delete(numeFisier);
        tabluriDeschise.delete(numeFisier);

        if (dateiFisiere.size === 0) { reseteazaImplicit(); return; }

        if (fisierActiv === numeFisier) {
            const urmator = tabluriDeschise.size > 0
                ? tabluriDeschise.values().next().value
                : dateiFisiere.keys().next().value;
            if (!tabluriDeschise.has(urmator)) tabluriDeschise.add(urmator);
            fisierActiv = urmator;
            editor.setValue(dateiFisiere.get(urmator));
        }
        randeazaTaburi();
        randeazaFisiereSidebar();
    }

    // Dacă nu mai există niciun fișier, repornim cu Hello World-ul limbajului curent
    function reseteazaImplicit() {
        dateiFisiere.clear();
        tabluriDeschise.clear();
        dateiFisiere.set(limbajCurent.fisierPrincipal, limbajCurent.hello);
        tabluriDeschise.add(limbajCurent.fisierPrincipal);
        fisierActiv = limbajCurent.fisierPrincipal;
        editor.setValue(limbajCurent.hello);
        randeazaTaburi();
        randeazaFisiereSidebar();
    }

    // ── RANDARE TABURI ────────────────────────────────────────────
    function randeazaTaburi() {
        if (!containerTaburi) return;
        containerTaburi.innerHTML = '';

        tabluriDeschise.forEach(numeFisier => {
            const tab = document.createElement('div');
            tab.className = `tab ${numeFisier === fisierActiv ? 'activ' : ''}`;

            const eticheta = document.createElement('span');
            eticheta.textContent = numeFisier;

            const butonInchide = document.createElement('span');
            butonInchide.className = 'inchide-tab';
            butonInchide.innerHTML = '&times;';
            butonInchide.addEventListener('click', e => inchideTab(numeFisier, e));

            tab.appendChild(eticheta);
            tab.appendChild(butonInchide);
            tab.addEventListener('click', () => deschideFisier(numeFisier));
            containerTaburi.appendChild(tab);
        });
    }

    // ── RANDARE FIȘIERE SIDEBAR ───────────────────────────────────
    function randeazaFisiereSidebar() {
        if (!listaFisiere) return;
        listaFisiere.innerHTML = '';

        dateiFisiere.forEach((_, numeFisier) => {
            const element = document.createElement('div');
            element.className = `element-fisier ${numeFisier === fisierActiv ? 'activ' : ''}`;

            const icona = document.createElement('i');
            icona.className = getIconaFisier(numeFisier.split('.').pop().toLowerCase());

            const eticheta = document.createElement('span');
            eticheta.className   = 'nume-fisier';
            eticheta.textContent = numeFisier;
            eticheta.title       = numeFisier;

            const butonSterge = document.createElement('span');
            butonSterge.className = 'sterge-fisier';
            butonSterge.innerHTML = '&times;';
            butonSterge.title     = 'Șterge din proiect';
            butonSterge.addEventListener('click', e => { e.stopPropagation(); stergeFisier(numeFisier); });

            element.appendChild(icona);
            element.appendChild(eticheta);
            element.appendChild(butonSterge);
            element.addEventListener('click', () => deschideFisier(numeFisier));
            listaFisiere.appendChild(element);
        });

        // Recalculăm înălțimea panoului Files după ce s-a adăugat conținut
        const panouFisiere = document.getElementById('panou-fisiere');
        if (esteDeschisFisiere() && panouFisiere)
            panouFisiere.style.maxHeight = panouFisiere.scrollHeight + 'px';
    }

    // Returnează clasa CSS pentru iconița fișierului după extensie
    function getIconaFisier(extensie) {
        return {
            cpp: 'devicon-cplusplus-plain', c:    'devicon-c-plain',
            h:   'fa-solid fa-file-code',   hpp:  'fa-solid fa-file-code',
            py:  'devicon-python-plain',    java: 'devicon-java-plain',
            rs:  'devicon-rust-plain',      js:   'devicon-javascript-plain',
        }[extensie] || 'fa-solid fa-file';
    }

    // ── RANDARE INIȚIALĂ ──────────────────────────────────────────
    randeazaTaburi();
    randeazaFisiereSidebar();
    // Mesaj inițial în zona de output
    adaugaOutput('Output-ul programului va apărea aici după Run.', 'astept');
});