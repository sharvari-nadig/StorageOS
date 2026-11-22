# StorageOS — Intelligent Storage Management

**Making local storage easier to explore, understand, and manage.**

An AI-powered desktop application for intelligent file discovery, storage visualization, file management, and duplicate-file analysis.

<p align="center">
  <a href="https://github.com/sharvari-nadig/StorageOS/releases/tag/v4.0.0-rc.1">
    <img src="https://img.shields.io/badge/Download-Windows-blue?style=for-the-badge&logo=windows" alt="Download for Windows">
  </a>
  <img src="https://img.shields.io/badge/Release-v4.0.0--rc.1-orange?style=for-the-badge" alt="Version">
  <img src="https://img.shields.io/badge/Status-Pre--Release-yellow?style=for-the-badge" alt="Pre-release">
  <img src="https://img.shields.io/badge/Built%20With-Electron%20%7C%20React%20%7C%20TypeScript-blueviolet?style=for-the-badge" alt="Technology">
</p>

<p align="center">
  <b>Download:</b>
  <a href="https://github.com/sharvari-nadig/StorageOS/releases/tag/v4.0.0-rc.1">StorageOS v4.0.0-rc.1 — Windows Installer</a>
</p>

---

## 1. Project Overview

StorageOS is an intelligent desktop storage management application designed to simplify how users explore, analyze, and manage files on their local systems.

By combining interactive storage visualization, advanced file filtering, duplicate detection, and a locally integrated AI assistant, StorageOS transforms conventional file browsing into a more structured and accessible storage-analysis experience.

Built using Electron, React, and TypeScript, the application brings together desktop-level file-system access and a modern user interface.

Its local AI integration enables users to ask natural-language questions about indexed files, making file discovery and storage analysis more intuitive.

The primary objective of StorageOS is to help users understand how their storage is utilized, locate relevant files efficiently, identify redundant data, and make better-informed storage-management decisions.

## 2. Download and Installation

### Download for Windows

**Latest published release:** `v4.0.0-rc.1`

**Release type:** Pre-release (Release Candidate)

**Platform:** Windows

**Installer:** `StorageOS.Setup.4.0.0-rc.1.exe`

**Download size:** Approximately 181 MB

**[Download StorageOS for Windows](https://github.com/sharvari-nadig/StorageOS/releases/tag/v4.0.0-rc.1)**

### Installation Steps

1. Open the [StorageOS GitHub Releases page](https://github.com/sharvari-nadig/StorageOS/releases/tag/v4.0.0-rc.1).
2. Navigate to the Assets section.
3. Download `StorageOS.Setup.4.0.0-rc.1.exe`.
4. Run the downloaded installer.
5. Follow the installation instructions.
6. Launch StorageOS from the installed application shortcut or Start menu.

**Note:** StorageOS is currently distributed through a Windows installer. The published version is a release candidate.

### Local AI Requirements

The AI Storage Assistant uses a locally hosted language model through Ollama.

For local AI functionality, install:

- [Ollama](https://ollama.com/)
- Qwen3 1.7B model

Download the model using:

```bash
ollama pull qwen3:1.7b
```

Ensure that Ollama is running before using the AI assistant.

The other storage-management features do not require the language model.

---

## 3. Application Screenshots

### StorageOS Dashboard

Displays total storage, used storage, free storage, storage utilization, and folder-analysis options.

![StorageOS Dashboard](screenshots/dashboard.png)

### AI-Powered Storage Assistant

Allows users to search indexed files and ask natural-language questions about their storage.

![StorageOS AI Assistant](screenshots/ai-assistant.png)

### Duplicate File Detection

Identifies duplicate files, displays duplicate groups, and estimates potential storage savings.

![StorageOS Duplicate File Detection](screenshots/duplicate-files.png)

### File Explorer

Provides a desktop interface for browsing and managing local files and folders.

![StorageOS File Explorer](screenshots/explorer.png)

---

## 4. Key Features

### 4.1 Intelligent Storage Visualization

- Interactive treemap for visualizing indexed storage by file category and folder.
- Storage summaries displaying indexed file counts and total indexed storage.
- Folder-level navigation and contextual file exploration.
- Visual representation of storage distribution to help identify space-intensive categories.

### 4.2 Advanced File Search and Filtering

- Search indexed files using filenames, keywords, extensions, and file paths.
- Filter results by minimum and maximum file size.
- Filter by file extension and modification date.
- Combine search terms and filters to narrow down relevant results.

### 4.3 AI-Powered Storage Assistant

- Natural-language interaction for storage-related queries.
- Search for files using filenames, keywords, and common extensions.
- Identify large files and files that have not been modified recently.
- Retrieve relevant file metadata, including category, size, and location.
- Open matching files directly from search results.
- Local language-model integration through Ollama and Qwen3 1.7B.

**Example queries:**

```text
Find my PDF files
Show my 10 largest files
Find files larger than 100 MB
Which files have not been modified recently?
How much space do images occupy?
```

### 4.4 Duplicate File Detection

- Identify potential duplicate candidates by grouping files with matching sizes.
- Verify duplicate content using SHA-256 hashing.
- Display duplicate groups and potential storage savings.
- Report scan progress during duplicate analysis.
- Allow users to select duplicate copies for removal.
- Move selected files to the Windows Recycle Bin through Electron shell integration.

### 4.5 Desktop Application Integration

- Native Windows desktop experience powered by Electron.
- React-based interface with TypeScript for structured development.
- Local metadata persistence using SQLite-compatible storage through sql.js.
- Electron IPC communication between renderer and main processes.
- File-system scanning and metadata retrieval for indexed storage analysis.

### 4.6 Transfers Management

- Dedicated Transfers section within the desktop interface.
- Access to the application's transfer-management view.

---

## 5. Technology Stack

| Technology | Purpose |
|---|---|
| Electron | Desktop application framework and operating-system integration |
| React | Component-based user interface |
| TypeScript | Type-safe application development |
| JavaScript | Application logic |
| sql.js | Local SQLite-compatible metadata storage |
| Node.js | Backend operations and file-system processing |
| Ollama | Local language-model runtime |
| Qwen3 1.7B | Natural-language query interpretation |
| Webpack | Application bundling and build workflow |
| SHA-256 | Duplicate-file content verification |

---

## 6. System Architecture

StorageOS follows a desktop architecture that separates the user interface, application logic, and persistent metadata.

### Architecture Overview

```mermaid
flowchart TD
    A[StorageOS Desktop Application]

    A --> B[Renderer Layer]
    A --> C[Electron Main Process]

    B --> D[React UI]
    D --> E[Dashboard and Visualization]
    D --> F[File Explorer and Filters]
    D --> G[AI Storage Assistant]
    D --> H[Duplicate File Interface]

    B <-->|IPC Communication| C

    C --> I[File System Operations]
    C --> J[Storage and Metadata Layer]
    C --> K[Duplicate Detection Engine]

    J --> L[Local Database - sql.js]
    K --> M[SHA-256 Verification]

    G --> N[Local AI Layer]
    N --> O[Ollama]
    O --> P[Qwen3 1.7B]
```

### Renderer Layer

- Displays the dashboard, storage visualization, file filters, duplicate results, and AI assistant.
- Collects user queries and presents results.
- Provides an interactive desktop interface.

### Electron Main Process

- Handles operating-system interactions and IPC requests.
- Coordinates folder scanning, file opening, and duplicate-file operations.
- Connects renderer requests to storage and assistant logic.

### Storage and Metadata Layer

- Maintains indexed file metadata, including names, paths, sizes, categories, extensions, and modification timestamps.
- Supports retrieval and analysis of indexed files.
- Persists metadata in a local database.

### Local AI Layer

- Uses Ollama to communicate with the Qwen3 1.7B language model.
- Interprets natural-language questions that are not handled by dedicated storage-query rules.
- Works alongside deterministic application logic for storage-specific operations.

---

## 7. How It Works

StorageOS follows a structured workflow:

1. **Select and scan:** Choose a folder to analyze.
2. **Index metadata:** Collect file information and save it in the local database.
3. **Analyze storage:** Explore indexed files using category visualization and filters.
4. **Ask questions:** Use the AI assistant to search for files and request storage insights.
5. **Detect duplicates:** Compare candidate files by size and verify content using SHA-256.
6. **Take action:** Open matching files or review selected duplicates for removal.

---

## 8. Developer Setup

Developers who want to explore, modify, or contribute to StorageOS can run the project locally.

### Prerequisites

- Windows operating system.
- Node.js and npm.
- Git.
- Ollama installed locally.
- Qwen3 1.7B model downloaded through Ollama for local AI functionality.

### Step 1: Clone the Repository

```bash
git clone https://github.com/sharvari-nadig/StorageOS.git
cd StorageOS
```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Download the Local AI Model

```bash
ollama pull qwen3:1.7b
```

Ensure that the Ollama service is running before testing AI responses.

### Step 4: Build the Application

```bash
npm run build
```

Wait for Webpack compilation and TypeScript checking to complete successfully.

### Step 5: Launch StorageOS

```bash
npx electron .
```

---

## 9. Usage Guide

1. Launch StorageOS.
2. Open the Analyze section and scan a folder to index its files.
3. Explore storage distribution through the available visualization.
4. Apply search terms and advanced filters to find specific files.
5. Open AI Assistant and ask questions about indexed files.
6. Open Duplicate Files to scan a folder and review detected duplicates.
7. Review files carefully before moving any selected duplicates to the Recycle Bin.
8. Use the Explorer section to browse local files and folders.

**Example AI queries:**

- Find my PDF files.
- Show my 10 largest files.
- Find files larger than 100 MB.
- Which files have not been modified recently?

---

## 10. Security and Privacy Considerations

- File metadata is stored locally by the application.
- The language model runs locally through Ollama, avoiding the need for a paid hosted LLM API for the configured assistant workflow.
- File deletion actions should be reviewed carefully before confirmation.
- File discovery and analysis depend on which folders have been indexed.
- Local AI responses may be imperfect; verify important results before acting on them.

---

## 11. Current Scope and Limitations

- Storage analysis operates on indexed file metadata and may not reflect unindexed folders.
- Natural-language interpretation depends on the installed local language model and application query handling.
- AI-generated explanations are not guaranteed to be correct.
- Performance depends on the computer's available memory, processor, and storage.
- Cloud synchronization, automated backup and restore, and automatic storage cleanup are outside the currently implemented scope.
- Local AI functionality requires the Ollama runtime and configured model.

---

## 12. Future Enhancements

Potential future improvements include:

- More robust semantic file search.
- Smart storage recommendations based on usage patterns.
- Configurable indexing schedules and incremental scanning.
- Improved file organization suggestions.
- Exportable storage reports and analysis summaries.
- Additional safeguards and audit information for file-management actions.

---

## 13. Project Objective

StorageOS demonstrates how desktop application development, file-system processing, local metadata persistence, cryptographic hashing, interactive visualization, and local language models can be combined into a unified storage-management solution.

The project aims to make file discovery more accessible, storage utilization easier to understand, and duplicate-file analysis more efficient through an intuitive desktop experience.

---

## 14. License and Attribution

StorageOS extends the open-source `react-explorer` project, originally developed by Nicolas Ramz and distributed under the MIT License.

StorageOS includes original enhancements and modifications, including storage visualization, duplicate-file detection, advanced file filtering, and a locally powered AI storage assistant.

The original copyright notice and MIT License terms are retained in the `LICENSE` file. Additional contributions are provided subject to the applicable license terms.

---

## 15. Links

- **GitHub Repository:** https://github.com/sharvari-nadig/StorageOS
- **Windows Download:** https://github.com/sharvari-nadig/StorageOS/releases/tag/v4.0.0-rc.1
- **Ollama:** https://ollama.com/
- **Qwen3:** https://ollama.com/library/qwen3

---

<p align="center">
  <b>StorageOS — Making Local Storage Smarter.</b>
  <br>
  Built with Electron, React, TypeScript, and Local AI.
</p>
