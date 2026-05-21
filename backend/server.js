const express    = require('express');
const cors       = require('cors');
const fs         = require('fs');
const path       = require('path');
const { exec }   = require('child_process');

const app  = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// ── LANGUAGE CONFIG ───────────────────────────────────────────────────────────
// Each entry defines the Docker image and how to build the shell command
// for both single-file and multi-file (project) compilations.
//
// singleCmd(containerPath)     → shell string run inside Docker for one file
// projectCmd(containerPaths[]) → shell string run inside Docker for many files
// projectEntryFilter(name)     → which filenames count as source files
// projectEntry                 → the class/file used as entry point (Java/Rust)
//
const LANG = {
    cpp: {
        image:    'frolvlad/alpine-gxx',
        ext:      '.cpp',
        singleCmd:  (f)    => `g++ -o /out ${f} && /out`,
        projectCmd: (files) => `g++ -o /out ${files.join(' ')} && /out`,
        projectFilter: n => ['.cpp', '.c'].includes(path.extname(n).toLowerCase()),
    },
    c: {
        image:    'frolvlad/alpine-gxx',
        ext:      '.c',
        singleCmd:  (f)    => `gcc -o /out ${f} && /out`,
        projectCmd: (files) => `gcc -o /out ${files.join(' ')} && /out`,
        projectFilter: n => ['.c'].includes(path.extname(n).toLowerCase()),
    },
    python: {
        image:    'python:3.12-alpine',
        ext:      '.py',
        // Python: just run the file — no compilation step
        singleCmd:  (f)    => `python3 ${f}`,
        // For project mode, run main.py; fall back to first file if absent
        projectCmd: (files) => {
            const entry = files.find(f => f.endsWith('/main.py')) || files[0];
            return `python3 ${entry}`;
        },
        projectFilter: n => path.extname(n).toLowerCase() === '.py',
    },
    java: {
        image:    'eclipse-temurin:21-alpine',
        ext:      '.java',
        // Java: file must be in a dir as Main.java; compile then run
        singleCmd:  ()     => `javac /src/Main.java && java -cp /src Main`,
        projectCmd: (files) => `javac ${files.join(' ')} && java -cp /src Main`,
        projectFilter: n => path.extname(n).toLowerCase() === '.java',
        // Java single-file needs its own temp dir (class name = file name rule)
        needsSrcDir: true,
        containerSrcFile: '/src/Main.java',
    },
    rust: {
        image:    'rust:alpine',
        ext:      '.rs',
        singleCmd:  (f)    => `rustc ${f} -o /out && /out`,
        // Rust project: just compile main.rs (cargo not available in this image)
        projectCmd: (files) => {
            const entry = files.find(f => f.endsWith('/main.rs')) || files[0];
            return `rustc ${entry} -o /out && /out`;
        },
        projectFilter: n => path.extname(n).toLowerCase() === '.rs',
    },
};

// ── /compile ENDPOINT ─────────────────────────────────────────────────────────
app.post('/compile', (req, res) => {
    const { code, files, language } = req.body;

    const lang = LANG[language];
    if (!lang) {
        return res.json({ output: `Limbaj nesuportat: "${language}". Suportate: ${Object.keys(LANG).join(', ')}.` });
    }
    if (!code && (!files || files.length === 0)) {
        return res.status(400).json({ error: 'code or files required' });
    }

    // ── MULTI-FILE (PROJECT) MODE ─────────────────────────────────
    if (files && files.length > 0) {
        const tmpDir = path.join(__dirname, `tmp_proj_${Date.now()}`);
        try { fs.mkdirSync(tmpDir); } catch {
            return res.status(500).json({ output: "Eroare: nu s-a putut crea directorul temporar." });
        }

        // Write every source file to the temp dir
        try {
            files.forEach(f => {
                const safeName = path.basename(f.name);
                fs.writeFileSync(path.join(tmpDir, safeName), f.content);
            });
        } catch (e) {
            cleanupDir(tmpDir);
            return res.status(500).json({ output: "Eroare la scrierea fișierelor." });
        }

        const containerPaths = files
            .filter(f => lang.projectFilter(f.name))
            .map(f => `/src/${path.basename(f.name)}`);

        if (containerPaths.length === 0) {
            cleanupDir(tmpDir);
            return res.json({ output: `Nu există fișiere ${lang.ext} în proiect.` });
        }

        const shellCmd    = lang.projectCmd(containerPaths);
        const hostDir     = tmpDir.replace(/\\/g, '/');
        const dockerCmd   = `docker run --rm -v "${hostDir}:/src" ${lang.image} sh -c "${shellCmd}"`;

        console.log(`[project/${language}] ${dockerCmd}`);
        exec(dockerCmd, (error, stdout, stderr) => {
            cleanupDir(tmpDir);
            if (error) return res.json({ output: stderr || error.message });
            res.json({ output: stdout });
        });

    // ── SINGLE FILE MODE ──────────────────────────────────────────
    } else {
        // Java needs a directory because the filename must match the class name
        if (lang.needsSrcDir) {
            const tmpDir = path.join(__dirname, `tmp_java_${Date.now()}`);
            try { fs.mkdirSync(tmpDir); } catch {
                return res.status(500).json({ output: "Eroare la crearea directorului temporar." });
            }
            try {
                fs.writeFileSync(path.join(tmpDir, 'Main.java'), code);
            } catch {
                cleanupDir(tmpDir);
                return res.status(500).json({ output: "Eroare la scrierea fișierului." });
            }

            const hostDir   = tmpDir.replace(/\\/g, '/');
            const shellCmd  = lang.singleCmd();
            const dockerCmd = `docker run --rm -v "${hostDir}:/src" ${lang.image} sh -c "${shellCmd}"`;

            console.log(`[single/java] ${dockerCmd}`);
            exec(dockerCmd, (error, stdout, stderr) => {
                cleanupDir(tmpDir);
                if (error) return res.json({ output: stderr || error.message });
                res.json({ output: stdout });
            });

        } else {
            // All other languages: mount the single file directly
            const ext      = lang.ext;
            const fileName = `temp_${Date.now()}${ext}`;
            const filePath = path.join(__dirname, fileName);

            try { fs.writeFileSync(filePath, code); } catch {
                return res.status(500).json({ output: "Eroare la scrierea fișierului." });
            }

            const hostPath  = filePath.replace(/\\/g, '/');
            const container = `/test${ext}`;
            const shellCmd  = lang.singleCmd(container);
            const dockerCmd = `docker run --rm -v "${hostPath}:${container}" ${lang.image} sh -c "${shellCmd}"`;

            console.log(`[single/${language}] ${dockerCmd}`);
            exec(dockerCmd, (error, stdout, stderr) => {
                try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (_) {}
                if (error) return res.json({ output: stderr || error.message });
                res.json({ output: stdout });
            });
        }
    }
});

function cleanupDir(dirPath) {
    try { fs.rmSync(dirPath, { recursive: true, force: true }); }
    catch (e) { console.error(`Cleanup failed: ${dirPath}`, e.message); }
}

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});