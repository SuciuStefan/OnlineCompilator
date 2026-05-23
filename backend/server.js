/*
 * server.js — CC101 Backend
 *
 * Responsabilitate unică: primește cod sursă de la frontend,
 * îl scrie pe disc, îl compilează/rulează într-un container Docker
 * și returnează output-ul înapoi.
 *
 * Flux pentru orice limbaj:
 *   1. Validare cerere
 *   2. Normalizare → mereu un array de fișiere { name, content }
 *   3. Scriere în director temporar
 *   4. Rulare Docker cu mount pe acel director
 *   5. Curățare director temporar
 *   6. Răspuns JSON { output }
 */

const express   = require('express');
const cors      = require('cors');
const fs        = require('fs');
const path      = require('path');
const { spawn } = require('child_process');

const app  = express();
const PORT = 3000;

// Oprim execuția după 10 secunde — protecție împotriva buclelor infinite
const TIMEOUT_MS = 10_000;

app.use(cors());
app.use(express.json());

// ── CONFIGURAȚIA LIMBAJELOR ───────────────────────────────────────────────────
//
// Fiecare limbaj definește:
//   imagine       — imaginea Docker folosită pentru compilare/rulare
//   extensie      — extensia fișierului sursă (.cpp, .py etc.)
//   filtruSursa   — ce extensii sunt fișiere de compilat (nu header-e etc.)
//   comanda       — funcție care primește căile din container și returnează
//                   comanda shell completă (compilare + rulare)
//   numeFisierFix — (opțional) Java impune că numele fișierului = numele clasei
//
const LIMBAJE = {
    cpp: {
        imagine:     'frolvlad/alpine-gxx',
        extensie:    '.cpp',
        filtruSursa: ext => ['.cpp', '.c'].includes(ext),
        comanda:     fisiere => `g++ -o /out ${fisiere.join(' ')} && /out`,
    },
    c: {
        imagine:     'frolvlad/alpine-gxx',
        extensie:    '.c',
        filtruSursa: ext => ext === '.c',
        comanda:     fisiere => `gcc -o /out ${fisiere.join(' ')} && /out`,
    },
    python: {
        imagine:     'python:3.12-alpine',
        extensie:    '.py',
        filtruSursa: ext => ext === '.py',
        // Rulăm main.py dacă există, altfel primul fișier din listă
        comanda:     fisiere => `python3 ${fisiere.find(f => f.endsWith('main.py')) || fisiere[0]}`,
    },
    java: {
        imagine:       'eclipse-temurin:21-alpine',
        extensie:      '.java',
        filtruSursa:   ext => ext === '.java',
        // Java cere ca numele fișierului să fie identic cu numele clasei publice
        numeFisierFix: 'Main.java',
        comanda:       fisiere => `javac ${fisiere.join(' ')} && java -cp /src Main`,
    },
    rust: {
        imagine:     'rust:alpine',
        extensie:    '.rs',
        filtruSursa: ext => ext === '.rs',
        // Compilăm main.rs dacă există, altfel primul fișier
        comanda:     fisiere => `rustc ${fisiere.find(f => f.endsWith('main.rs')) || fisiere[0]} -o /out && /out`,
    },
};

// ── ENDPOINT /compile ─────────────────────────────────────────────────────────
app.post('/compile', (req, res) => {
    const { code, files, language, stdin = '' } = req.body;

    // Validare: limbajul trebuie să existe în configurație
    const lang = LIMBAJE[language];
    if (!lang) {
        const disponibile = Object.keys(LIMBAJE).join(', ');
        return res.json({ output: `Limbaj nesuportat: "${language}". Disponibile: ${disponibile}.` });
    }

    // Validare: trebuie să primim fie cod direct, fie o listă de fișiere
    if (!code && (!files || files.length === 0)) {
        return res.status(400).json({ error: 'Cererea trebuie să conțină "code" sau "files".' });
    }

    // ── NORMALIZARE ───────────────────────────────────────────────
    // Indiferent dacă vine un singur fișier sau un proiect întreg,
    // lucrăm mereu cu un array uniform de obiecte { name, content }.
    // Dacă e un fișier singular Java, îi forțăm numele la "Main.java".
    const listaSurse = files?.length
        ? files
        : [{ name: lang.numeFisierFix || `main${lang.extensie}`, content: code }];

    // ── SCRIERE PE DISC ───────────────────────────────────────────
    const dirTemp = path.join(__dirname, `tmp_${Date.now()}`);

    try {
        fs.mkdirSync(dirTemp);
    } catch {
        return res.status(500).json({ output: 'Eroare server: nu s-a putut crea directorul temporar.' });
    }

    try {
        // Scriem fiecare fișier în directorul temporar (path.basename elimină orice path traversal)
        listaSurse.forEach(f => {
            fs.writeFileSync(path.join(dirTemp, path.basename(f.name)), f.content);
        });
    } catch {
        curata(dirTemp);
        return res.status(500).json({ output: 'Eroare server: nu s-a putut scrie fișierul sursă.' });
    }

    // ── CONSTRUIRE COMANDĂ DOCKER ─────────────────────────────────
    // Filtrăm doar fișierele compilabile (excludem header-ele, fișierele de date etc.)
    const caiContainer = listaSurse
        .filter(f => lang.filtruSursa(path.extname(f.name).toLowerCase()))
        .map(f => `/src/${path.basename(f.name)}`);

    if (caiContainer.length === 0) {
        curata(dirTemp);
        return res.json({ output: `Nu există fișiere ${lang.extensie} de compilat în proiect.` });
    }

    // Montăm directorul temporar ca /src în container (-i ține stdin deschis pentru input)
    const argsDocker = [
        'run', '--rm', '-i',
        '-v', `${dirTemp.replace(/\\/g, '/')}:/src`,
        lang.imagine,
        'sh', '-c', lang.comanda(caiContainer),
    ];

    // ── RULARE ȘI RĂSPUNS ─────────────────────────────────────────
    ruleazaDocker(argsDocker, stdin, (eroare, output) => {
        curata(dirTemp);
        res.json({ output: eroare || output });
    });
});

// ── ruleazaDocker ─────────────────────────────────────────────────────────────
// Pornește un container Docker, îi trimite stdin-ul utilizatorului,
// colectează stdout + stderr și apelează callback-ul cu rezultatul.
// Dacă programul depășește TIMEOUT_MS, containerul este omorât.
function ruleazaDocker(args, stdinDate, callback) {
    console.log(`[docker] ${args.join(' ')}`);

    const proces  = spawn('docker', args);
    let stdout    = '';
    let stderr    = '';
    let terminat  = false;

    // Trimitem input-ul utilizatorului în stdin-ul programului, apoi închidem pipe-ul
    if (stdinDate?.trim()) proces.stdin.write(stdinDate);
    proces.stdin.end();

    // Acumulăm output-ul bucată cu bucată (chunk-urile pot veni fragmentat)
    proces.stdout.on('data', chunk => { stdout += chunk.toString(); });
    proces.stderr.on('data', chunk => { stderr += chunk.toString(); });

    // Timer de siguranță — dacă programul rulează prea mult, îl oprim forțat
    const timer = setTimeout(() => {
        if (!terminat) {
            proces.kill('SIGKILL');
        }
    }, TIMEOUT_MS);

    proces.on('close', (cod, semnal) => {
        terminat = true;
        clearTimeout(timer);

        if (semnal === 'SIGKILL') {
            return callback(
                `⏱ Timeout: execuția a depășit ${TIMEOUT_MS / 1000} secunde și a fost oprită.\n` +
                `Verifică dacă programul tău are un loop infinit sau așteaptă input din STDIN.`
            );
        }

        // Cod de ieșire nenul = eroare de compilare sau runtime
        if (cod !== 0) return callback(stderr || `Procesul s-a terminat cu codul ${cod}.`);

        callback(null, stdout || '(fără output)');
    });

    proces.on('error', err => {
        terminat = true;
        clearTimeout(timer);
        callback(`Eroare la pornirea Docker: ${err.message}\nAsigură-te că Docker Desktop rulează.`);
    });
}

// ── curata ────────────────────────────────────────────────────────────────────
// Șterge directorul temporar după fiecare compilare.
// Eroarea e logată dar nu aruncată — curățarea nu trebuie să afecteze răspunsul.
function curata(dirPath) {
    try {
        fs.rmSync(dirPath, { recursive: true, force: true });
    } catch (e) {
        console.error(`[cleanup] Nu am putut șterge ${dirPath}:`, e.message);
    }
}

// ── START SERVER ──────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
    console.log(`CC101 Backend pornit pe portul ${PORT} (timeout: ${TIMEOUT_MS / 1000}s)`);
});
