# Minecraft Camera Bot

This project uses Mineflayer to create an automated "camera" bot in Minecraft. It connects to a server, can be viewed headlessly via a web browser, and is designed to perform cinematic tasks like following and circling players.

---

### ## 1. Environment Setup

Before you begin, ensure you have the following installed on your machine (e.g., your Mac Mini):

* **Node.js**: Version 18.x or higher is recommended. You can download it from [nodejs.org](https://nodejs.org/).
* **NPM**: This is the Node Package Manager and comes included with Node.js.

---

### ## 2. Project Installation

Follow these steps in your terminal to set up the project:

1.  **Clone the Repository**:
    If you're using Cursor with GitHub, clone your repository to your local machine.

2.  **Navigate to Project Directory**:
    ```bash
    cd path/to/your/project
    ```

3.  **Install Dependencies**:
    This command reads the `package.json` file and installs the required libraries (Mineflayer, Keytar, etc.).
    ```bash
    npm install
    ```

---

### ## 3. Storing Credentials Securely (macOS Keychain)

For maximum security, this project stores **all credentials** (both email and password) in the encrypted macOS Keychain. This avoids having any sensitive