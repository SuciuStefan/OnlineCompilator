document.addEventListener('DOMContentLoaded', () => {

    // ── LANGUAGE DEFINITIONS ─────────────────────────────────────
    // Single source of truth for everything language-related.
    // cmMode    = CodeMirror mode string
    // icon      = Devicon / FA class shown in sidebar + toolbar
    // mainFile  = the default filename created when switching to this language
    // hello     = starter Hello World content for that file
    const LANGUAGES = {
        cpp: {
            id:       'cpp',
            label:    'C++',
            icon:     'devicon-cplusplus-plain',
            ext:      '.cpp',
            cmMode:   'text/x-c++src',
            mainFile: 'main.cpp',
            hello:
`#include <iostream>
using namespace std;
int main() {
    cout << "Hello, World!" << endl;
    return 0;
}`,
        },
        c: {
            id:       'c',
            label:    'C',
            icon:     'devicon-c-plain',
            ext:      '.c',
            cmMode:   'text/x-csrc',
            mainFile: 'main.c',
            hello:
`#include <stdio.h>
int main() {
    printf("Hello, World!\\n");
    return 0;
}`,
        },
        python: {
            id:       'python',
            label:    'Python',
            icon:     'devicon-python-plain',
            ext:      '.py',
            cmMode:   'text/x-python',
            mainFile: 'main.py',
            hello:   `print("Hello, World!")`,
        },
        java: {
            id:       'java',
            label:    'Java',
            icon:     'devicon-java-plain',
            ext:      '.java',
            cmMode:   'text/x-java',
            // Java class name MUST match the filename — backend expects Main.java
            mainFile: 'Main.java',
            hello:
`public class Main {
    public static void main(String[] args) {
        System.out.println("Hello, World!");
    }
}`,
        },
        rust: {
            id:       'rust',
            label:    'Rust',
            icon:     'devicon-rust-plain',
            ext:      '.rs',
            cmMode:   'text/x-rustsrc',
            mainFile: 'main.rs',
            hello:
`fn main() {
    println!("Hello, World!");
}`,
        },
    };

    let currentLang = LANGUAGES.cpp; // active language

    // ── CODEMIRROR INIT ──────────────────────────────────────────
    const textArea = document.getElementById("editorSource");
    if (!textArea) { console.error("textarea not found"); return; }

    const editor = CodeMirror.fromTextArea(textArea, {
        lineNumbers:    true,
        mode:           currentLang.cmMode,
        theme:          "dracula",
        indentUnit:     4,
        tabSize:        4,
        indentWithTabs: true,
        lineWrapping:   true,
    });
    editor.setSize("100%", "96%");

    const consoleDiv = document.getElementById("consoleOutput");

    // ── FILE DATA MODEL ──────────────────────────────────────────
    // filesData → Map<filename, content>  — every file in the project
    // openTabs  → Set<filename>           — files with an open editor tab
    // Closing a tab removes from openTabs but NOT from filesData/sidebar.
    // Deleting from sidebar removes from both.

    const filesData = new Map();
    const openTabs  = new Set();
    let   activeFilename = currentLang.mainFile;

    filesData.set(currentLang.mainFile, currentLang.hello);
    openTabs.add(currentLang.mainFile);
    editor.setValue(currentLang.hello);

    const tabsContainer = document.getElementById("tabsContainer");
    const filesList     = document.getElementById("filesList");
    const fileInput     = document.getElementById("fileInput");
    const uploadBtn     = document.getElementById("uploadFileBtn");

    // ── COMPILE ──────────────────────────────────────────────────
    function runCompile(mode) {
        if (activeFilename) filesData.set(activeFilename, editor.getValue());

        consoleDiv.innerText = mode === 'project'
            ? `Compilare proiect (${currentLang.label})... ⏳`
            : `Compilare fișier activ (${currentLang.label})... ⏳`;
        consoleDiv.style.color = 'yellow';

        let body;
        if (mode === 'project') {
            const sourceFiles = [];
            filesData.forEach((content, filename) => {
                // Only send files matching the current language extension
                if (filename.endsWith(currentLang.ext)) {
                    sourceFiles.push({ name: filename, content });
                }
            });
            if (sourceFiles.length === 0) {
                consoleDiv.innerText = `Nu există fișiere ${currentLang.ext} în proiect.`;
                consoleDiv.style.color = '#ff5555';
                return;
            }
            body = JSON.stringify({ language: currentLang.id, files: sourceFiles });
        } else {
            body = JSON.stringify({ language: currentLang.id, code: editor.getValue() });
        }

        fetch('http://127.0.0.1:3000/compile', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
        })
        .then(r => { if (!r.ok) throw new Error(`Server Error: ${r.status}`); return r.json(); })
        .then(data => {
            const isError = /error:|Eroare/i.test(data.output);
            consoleDiv.innerText = 'Output:\n> ' + data.output;
            consoleDiv.style.color = isError ? '#ff5555' : '#9eefb4';
        })
        .catch(err => {
            console.error(err);
            consoleDiv.innerText = 'Eroare de conexiune! Verifică consola (F12).';
            consoleDiv.style.color = 'red';
        });
    }

    // ── SAVE ─────────────────────────────────────────────────────
    function runSave(mode) {
        if (activeFilename) filesData.set(activeFilename, editor.getValue());

        if (mode === 'single') {
            downloadBlob(activeFilename || 'untitled', filesData.get(activeFilename) || '');
        } else {
            const zip = new JSZip();
            filesData.forEach((content, name) => zip.file(name, content));
            zip.generateAsync({ type: 'blob' }).then(blob => downloadBlob('project.zip', blob, true));
        }
    }

    function downloadBlob(filename, data, isBlob = false) {
        const blob = isBlob ? data : new Blob([data], { type: 'text/plain' });
        const url  = URL.createObjectURL(blob);
        const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
        a.click();
        URL.revokeObjectURL(url);
    }

    // ── SPLIT BUTTONS ────────────────────────────────────────────
    function setupSplitButton(mainId, arrowId, dropdownId, defaultAction) {
        const mainBtn  = document.getElementById(mainId);
        const arrowBtn = document.getElementById(arrowId);
        const dropdown = document.getElementById(dropdownId);

        mainBtn.addEventListener('click', () => defaultAction());

        arrowBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const wasOpen = dropdown.classList.contains('open');
            closeAllDropdowns();
            if (!wasOpen) dropdown.classList.add('open');
        });

        dropdown.querySelectorAll('.dropdown-item').forEach(item => {
            item.addEventListener('click', () => {
                const a = item.dataset.action;
                closeAllDropdowns();
                if (a === 'run-single')   runCompile('single');
                if (a === 'run-project')  runCompile('project');
                if (a === 'save-single')  runSave('single');
                if (a === 'save-project') runSave('project');
            });
        });
    }

    function closeAllDropdowns() {
        document.querySelectorAll('.split-dropdown.open').forEach(d => d.classList.remove('open'));
    }
    document.addEventListener('click', closeAllDropdowns);

    setupSplitButton('saveButton', 'saveArrow', 'saveDropdown', () => runSave('single'));
    setupSplitButton('runButton',  'runArrow',  'runDropdown',  () => runCompile('single'));

    // ── LANGUAGE SWITCHER ────────────────────────────────────────
    const langIcon     = document.getElementById('langIcon');
    const langOptions  = document.getElementById('langOptions');
    const languagePanel  = document.getElementById('languagePanel');
    const languageToggle = document.getElementById('languageToggle');
    const languageArrow  = document.getElementById('languageArrow');
    let langPanelOpen = false;

    // Build the language buttons inside the panel
    function buildLangOptions() {
        langOptions.innerHTML = '';
        Object.values(LANGUAGES).forEach(lang => {
            const btn = document.createElement('button');
            btn.className   = `lang-btn ${lang.id === currentLang.id ? 'active' : ''}`;
            btn.dataset.lang = lang.id;

            const icon  = document.createElement('i');
            icon.className = lang.icon;

            const label  = document.createElement('span');
            label.textContent = lang.label;

            const extBadge  = document.createElement('small');
            extBadge.textContent = lang.ext;

            btn.appendChild(icon);
            btn.appendChild(label);
            btn.appendChild(extBadge);
            btn.addEventListener('click', () => switchLanguage(lang.id));
            langOptions.appendChild(btn);
        });
    }

    function switchLanguage(langId) {
        if (langId === currentLang.id) return;

        // Flush current editor content
        if (activeFilename) filesData.set(activeFilename, editor.getValue());

        const oldLang = currentLang;
        const newLang = LANGUAGES[langId];

        // Remove the old main file (the default one for the previous language).
        // User-uploaded files that happen to share the old main name are also
        // removed — acceptable trade-off since the user explicitly switched.
        if (filesData.has(oldLang.mainFile)) {
            filesData.delete(oldLang.mainFile);
            openTabs.delete(oldLang.mainFile);
        }

        // Create the new main file
        filesData.set(newLang.mainFile, newLang.hello);
        openTabs.add(newLang.mainFile);

        currentLang    = newLang;
        activeFilename = newLang.mainFile;

        // Update CodeMirror syntax highlighting
        editor.setOption('mode', newLang.cmMode);
        editor.setValue(newLang.hello);

        // Update the language icon in the sidebar group title
        langIcon.className = newLang.icon;

        buildLangOptions(); // refresh active state on buttons
        renderTabs();
        renderSidebarFiles();
    }

    languageToggle.addEventListener('click', () => {
        langPanelOpen = !langPanelOpen;
        languagePanel.style.maxHeight = langPanelOpen ? languagePanel.scrollHeight + 'px' : '0';
        languageArrow.style.transform  = langPanelOpen ? 'rotate(180deg)' : 'rotate(0deg)';
    });

    buildLangOptions();

    // ── SETTINGS PANEL TOGGLE ────────────────────────────────────
    const settingsToggle = document.getElementById('settingsToggle');
    const settingsPanel  = document.getElementById('settingsPanel');
    const settingsArrow  = document.getElementById('settingsArrow');
    let settingsOpen = false;

    settingsToggle.addEventListener('click', () => {
        settingsOpen = !settingsOpen;
        settingsPanel.style.maxHeight = settingsOpen ? settingsPanel.scrollHeight + 'px' : '0';
        settingsArrow.style.transform  = settingsOpen ? 'rotate(180deg)' : 'rotate(0deg)';
    });

    // ── FONT FAMILY ──────────────────────────────────────────────
    const fontTargets = [
        document.querySelector('.toolbar'),
        document.querySelector('.editor'),
        document.querySelector('.console'),
    ];
    const sidebar = document.querySelector('.sidebar');

    function applyFont(fontValue) {
        fontTargets.forEach(el => { if (el) el.style.fontFamily = fontValue; });
        if (sidebar) sidebar.style.fontFamily = fontValue;
        editor.getWrapperElement().style.fontFamily = fontValue;
        editor.refresh();
    }

    document.querySelectorAll('.font-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.font-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            applyFont(btn.dataset.font);
        });
    });

    // ── FONT SIZE SLIDER ─────────────────────────────────────────
    const sizeSlider  = document.getElementById('sizeSlider');
    const sizeDisplay = document.getElementById('sizeDisplay');

    function applySize(size) {
        const n = parseInt(size, 10);
        fontTargets.forEach(el => { if (el) el.style.fontSize = n + 'px'; });
        editor.getWrapperElement().style.fontSize = n + 'px';
        editor.refresh();
        sizeDisplay.textContent = n + 'px';
        if (sidebar) {
            const scale = (13 + (n - 13) * 0.5) / 13;
            sidebar.style.setProperty('--scale', scale);
        }
    }
    sizeSlider.addEventListener('input', () => applySize(sizeSlider.value));

    // ── FILES PANEL TOGGLE ───────────────────────────────────────
    const filesToggle = document.getElementById('filesToggle');
    const filesPanel  = document.getElementById('filesPanel');
    const filesArrow  = document.getElementById('filesArrow');
    let filesOpen = true;

    if (filesArrow) filesArrow.style.transform = 'rotate(180deg)';

    filesToggle.addEventListener('click', () => {
        filesOpen = !filesOpen;
        filesPanel.style.maxHeight = filesOpen ? filesPanel.scrollHeight + 'px' : '0';
        filesArrow.style.transform  = filesOpen ? 'rotate(180deg)' : 'rotate(0deg)';
    });

    // ── FILE UPLOAD ──────────────────────────────────────────────
    if (uploadBtn && fileInput) {
        uploadBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', e => {
            Array.from(e.target.files).forEach(file => {
                const reader = new FileReader();
                reader.onload = ev => addFile(file.name, ev.target.result);
                reader.readAsText(file);
            });
            fileInput.value = '';
        });
    }

    // ── FILE OPERATIONS ──────────────────────────────────────────
    function addFile(filename, content) {
        let uniqueName = filename;
        let n = 1;
        while (filesData.has(uniqueName)) {
            const dot  = filename.lastIndexOf('.');
            const base = dot >= 0 ? filename.slice(0, dot) : filename;
            const ext  = dot >= 0 ? filename.slice(dot)    : '';
            uniqueName = `${base}_${n}${ext}`;
            n++;
        }
        filesData.set(uniqueName, content);
        openTabs.add(uniqueName);
        switchToFile(uniqueName);
        renderSidebarFiles();
    }

    function switchToFile(filename) {
        if (activeFilename && filesData.has(activeFilename)) {
            filesData.set(activeFilename, editor.getValue());
        }
        if (!openTabs.has(filename)) openTabs.add(filename);
        activeFilename = filename;
        editor.setValue(filesData.get(filename));
        renderTabs();
        renderSidebarFiles();
    }

    function closeTab(filename, e) {
        e.stopPropagation();
        if (activeFilename === filename) filesData.set(filename, editor.getValue());
        openTabs.delete(filename);

        if (openTabs.size === 0) { resetToDefault(); return; }

        if (activeFilename === filename) {
            const next = openTabs.values().next().value;
            activeFilename = next;
            editor.setValue(filesData.get(next));
        }
        renderTabs();
        renderSidebarFiles();
    }

    function deleteFile(filename) {
        if (!confirm(`Ești sigur că vrei să ștergi "${filename}" din proiect?\nAceastă acțiune este ireversibilă.`)) return;

        filesData.delete(filename);
        openTabs.delete(filename);

        if (filesData.size === 0) { resetToDefault(); return; }

        if (activeFilename === filename) {
            const next = openTabs.size > 0
                ? openTabs.values().next().value
                : filesData.keys().next().value;
            if (!openTabs.has(next)) openTabs.add(next);
            activeFilename = next;
            editor.setValue(filesData.get(next));
        }
        renderTabs();
        renderSidebarFiles();
    }

    function resetToDefault() {
        filesData.clear();
        openTabs.clear();
        filesData.set(currentLang.mainFile, currentLang.hello);
        openTabs.add(currentLang.mainFile);
        activeFilename = currentLang.mainFile;
        editor.setValue(currentLang.hello);
        renderTabs();
        renderSidebarFiles();
    }

    // ── RENDER: TABS ─────────────────────────────────────────────
    function renderTabs() {
        if (!tabsContainer) return;
        tabsContainer.innerHTML = '';

        openTabs.forEach(filename => {
            const tab = document.createElement('div');
            tab.className = `tab ${filename === activeFilename ? 'active' : ''}`;

            const name     = document.createElement('span');
            name.textContent = filename;

            const close    = document.createElement('span');
            close.className  = 'close-tab';
            close.innerHTML  = '&times;';
            close.addEventListener('click', e => closeTab(filename, e));

            tab.appendChild(name);
            tab.appendChild(close);
            tab.addEventListener('click', () => switchToFile(filename));
            tabsContainer.appendChild(tab);
        });
    }

    // ── RENDER: SIDEBAR FILES ────────────────────────────────────
    function renderSidebarFiles() {
        if (!filesList) return;
        filesList.innerHTML = '';

        filesData.forEach((_, filename) => {
            const item     = document.createElement('div');
            item.className = `sidebar-file-item ${filename === activeFilename ? 'active' : ''}`;

            const icon     = document.createElement('i');
            icon.className = getFileIcon(filename.split('.').pop().toLowerCase());

            const name     = document.createElement('span');
            name.className   = 'sidebar-file-name';
            name.textContent = filename;
            name.title       = filename;

            const del      = document.createElement('span');
            del.className  = 'sidebar-file-delete';
            del.innerHTML  = '&times;';
            del.title      = 'Șterge din proiect';
            del.addEventListener('click', e => { e.stopPropagation(); deleteFile(filename); });

            item.appendChild(icon);
            item.appendChild(name);
            item.appendChild(del);
            item.addEventListener('click', () => switchToFile(filename));
            filesList.appendChild(item);
        });

        if (filesOpen && filesPanel) {
            filesPanel.style.maxHeight = filesPanel.scrollHeight + 'px';
        }
    }

    function getFileIcon(ext) {
        return {
            cpp:  'devicon-cplusplus-plain',
            c:    'devicon-c-plain',
            h:    'fa-solid fa-file-code',
            hpp:  'fa-solid fa-file-code',
            py:   'devicon-python-plain',
            java: 'devicon-java-plain',
            rs:   'devicon-rust-plain',
            js:   'devicon-javascript-plain',
        }[ext] || 'fa-solid fa-file';
    }

    // ── INITIAL RENDER ───────────────────────────────────────────
    renderTabs();
    renderSidebarFiles();
    if (filesPanel) filesPanel.style.maxHeight = filesPanel.scrollHeight + 'px';
});