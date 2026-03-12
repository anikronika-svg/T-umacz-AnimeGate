"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PROJECT_SCHEMA_VERSION = exports.PROJECT_CONFIG_FILE = void 0;
exports.createProjectOnDisk = createProjectOnDisk;
exports.openProjectFromDisk = openProjectFromDisk;
exports.saveProjectConfigOnDisk = saveProjectConfigOnDisk;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
exports.PROJECT_CONFIG_FILE = 'animegate-project.json';
exports.PROJECT_SCHEMA_VERSION = 1;
function isProjectConfigLikePath(value) {
    const lower = value.toLowerCase();
    return lower.endsWith('.json') || lower.endsWith('.agproj');
}
function sanitizePathPart(value) {
    return value
        .trim()
        .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
        .replace(/\s+/g, '_')
        .slice(0, 80);
}
function normalizeConfig(config) {
    const now = new Date().toISOString();
    return {
        ...config,
        schemaVersion: exports.PROJECT_SCHEMA_VERSION,
        updatedAt: config.updatedAt || now,
        createdAt: config.createdAt || now,
        anilist: {
            id: Number.isFinite(config.anilist?.id) ? config.anilist.id : null,
            title: config.anilist?.title?.trim() || '',
        },
        translationPreferences: {
            sourceLang: config.translationPreferences?.sourceLang || 'en',
            targetLang: config.translationPreferences?.targetLang || 'pl',
            preferredModelId: config.translationPreferences?.preferredModelId || 'deepl:deepl-default',
        },
        characterWorkflow: {
            characters: Array.isArray(config.characterWorkflow?.characters) ? config.characterWorkflow.characters : [],
            lineCharacterAssignments: Array.isArray(config.characterWorkflow?.lineCharacterAssignments) ? config.characterWorkflow.lineCharacterAssignments : [],
        },
        translationStyleSettings: {
            projectId: config.translationStyleSettings?.projectId || config.projectId,
            globalStyle: config.translationStyleSettings?.globalStyle || 'neutral',
            characters: Array.isArray(config.translationStyleSettings?.characters) ? config.translationStyleSettings.characters : [],
            updatedAt: config.translationStyleSettings?.updatedAt || now,
        },
    };
}
function assertProjectConfig(raw) {
    if (!raw || typeof raw !== 'object') {
        throw new Error('Nieprawidłowy plik projektu (brak obiektu JSON).');
    }
    const config = raw;
    if (config.schemaVersion !== exports.PROJECT_SCHEMA_VERSION) {
        throw new Error(`Nieobsługiwana wersja schematu projektu: ${String(config.schemaVersion)}.`);
    }
    if (!config.projectId || !config.title) {
        throw new Error('Nieprawidłowy plik projektu (brak projectId/title).');
    }
    return normalizeConfig(config);
}
async function createProjectOnDisk(args) {
    const projectFolderName = sanitizePathPart(args.projectId || args.title || `project_${Date.now()}`);
    if (!projectFolderName)
        throw new Error('Nieprawidłowa nazwa projektu.');
    const projectDir = path_1.default.join(args.parentDir, projectFolderName);
    const configPath = path_1.default.join(projectDir, exports.PROJECT_CONFIG_FILE);
    await fs_1.promises.mkdir(projectDir, { recursive: true });
    try {
        await fs_1.promises.access(configPath);
        throw new Error(`Projekt już istnieje: ${configPath}`);
    }
    catch {
        // Expected when file does not exist.
    }
    const now = new Date().toISOString();
    const config = normalizeConfig({
        ...args.initialConfig,
        projectDir,
        configPath,
        createdAt: now,
        updatedAt: now,
        schemaVersion: exports.PROJECT_SCHEMA_VERSION,
    });
    await fs_1.promises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
    return { projectDir, configPath, config };
}
async function openProjectFromDisk(projectPath) {
    const normalizedPath = projectPath.trim();
    if (!normalizedPath)
        throw new Error('Brak ścieżki projektu.');
    const looksLikeFile = isProjectConfigLikePath(normalizedPath);
    const projectDir = looksLikeFile ? path_1.default.dirname(normalizedPath) : normalizedPath;
    const configPath = looksLikeFile ? normalizedPath : path_1.default.join(projectDir, exports.PROJECT_CONFIG_FILE);
    const raw = await fs_1.promises.readFile(configPath, 'utf-8');
    const parsed = JSON.parse(raw);
    const config = assertProjectConfig(parsed);
    return { projectDir, configPath, config };
}
async function saveProjectConfigOnDisk(projectDir, nextConfig) {
    const normalizedDir = projectDir.trim();
    if (!normalizedDir)
        throw new Error('Brak ścieżki folderu projektu do zapisu.');
    const configPath = path_1.default.join(normalizedDir, exports.PROJECT_CONFIG_FILE);
    const normalized = normalizeConfig({
        ...nextConfig,
        projectDir: normalizedDir,
        configPath,
        updatedAt: new Date().toISOString(),
    });
    await fs_1.promises.writeFile(configPath, JSON.stringify(normalized, null, 2), 'utf-8');
    return { projectDir: normalizedDir, configPath, config: normalized };
}
