# NimiqVoteServer

This repo contains the code for the NimqVoteServer back-end code. The server has two purposes:

- sending config data to the front-end
- tallying votes

The server runs on port 8080.

## Running a NimiqVoteServer node
Running a node would be great! Here are some instructions:

### Basic setup (for Ubuntu)
Ensure you have Node.js v11 (v12 is not currently supported). You'll need ``sudo`` rights. Run this in your terminal:
```bash
sudo apt install build-essential python-dev
git clone https://github.com/MatthewDLudwig/NimiqVoteServer
cd NimiqVoteServer
npm install @nimiq/core
npm install nimiq-wrapper
```

### SSL support
You can use Let's Encrypt and Certbot to get a free HTTPS certificate. Currently, all front-ends require this. Ensure you are in the ``NimiqVoteServer`` directory, then run this. Follow the on-screen instructions when prompted:
```bash
# Install certbot
sudo apt-get update
sudo apt-get install software-properties-common
sudo add-apt-repository universe
sudo add-apt-repository ppa:certbot/certbot
sudo apt-get update
sudo apt install certbot

# Request certificate
sudo certbot certonly --standalone
```
Next, you'll need to tell the server about the certificates. Change line 9 of the server code from this:

```js
                 let keyRoot = "";
```

to this:

```js
                 let keyRoot = "/etc/letsencrypt/live/[DOMAIN_YOU_REGISTERED_WITH_CERTBOT]/";
```

You can now access your back-end server over HTTPS.
