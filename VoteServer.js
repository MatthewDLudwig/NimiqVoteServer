const Nimiq = require("@nimiq/core");
const Wrapper = require("nimiq-wrapper");
const fs = require('fs');

// SETTINGS YOU CAN CHANGE ARE BELOW
		// Leave keyRoot blank for http, specify keyRoot for https
		// If keyRoot is specified, it's expected that there is a privkey.pem and fullchain.pem in that folder.
    // To be used as a provider on https://nim.drawpad.org/voting.html , HTTPS is mandatory.
		let keyRoot = "";
		let port = 8080;
		let allowedHosts = [
			"nim.drawpad.org"
		];

		let config = {
			startBlock : 631136,
			endBlock   : 640000,
			voteAddress : generateAddress("TESTVOTE"),
//			voteAddress : "NQ07 0000 0000 0000 0000 0000 0000 0000 0000",
//			voteAddress : "NQ34 D8JU TVBX L9XS 109H LAMV JUCV 1UH7 RMXT",
			numChoices : 2,
			prompt : "Who is your favorite SpongeBob character?",
			options : [
				{ id : "A", name : "SpongeBob" },
				{ id : "B", name : "Patrick" },
				{ id : "C", name : "Sandy" },
				{ id : "D", name : "Squidward" },
				{ id : "E", name : "Mr. Krabs" },
				{ id : "F", name : "Gary" },
				{ id : "G", name : "Plankton" }
			]
		};
// SETTINGS YOU CAN CHANGE ARE ABOVE

let branching = false;
let wrapper = new Wrapper.NimiqWrapper({
	headChangedCallback : async () => {
		if (wrapper.blockHeight >= config.endBlock) {
			console.log("Overflowed to block: " + wrapper.blockHeight);
			rebranchToTarget();
		} else if(wrapper.blockHeight % 100 == 0) {
			console.log("Synced block: " + wrapper.blockHeight);
		}
	}
});
wrapper.initNode({
	dontConnect : true,
	whenReady : startServer,
	type : "DUMB-FULL"
});

async function onRequest(request, response) {
	if (allowedHosts.includes(request.headers.host)) {
		response.setHeader("Access-Control-Allow-Origin", "*");

		if (request.url == "/getConfig") {
			response.write(JSON.stringify(config));
		} else if (request.url == "/getVotes") {
			let txs = await getTransactionsByAddress(config.voteAddress);
			let voters = { };

			let possibleVotes = config.options.map(it => it.id);
			txs.forEach(tx => {
				let voteParts = tx.data.split(",").map(it => it.trim()).filter((item, index, arr) => {
					return arr.indexOf(item) >= index;
				});

				let voteGood = voteParts.reduce((t, c) => {
					return t && possibleVotes.includes(c);
				}, true);

				if (voteParts.length == config.numChoices && voteGood) {
					if (voters[tx.from]) {
						// If the stored tx is older than the new tx
						if (voters[tx.from].tx.height < tx.height) {
							voters[tx.from].tx = tx;
							voters[tx.from].vote = voteParts;
						}
					} else {
						voters[tx.from] = {
							tx : tx,
							balance : -1,
							vote : voteParts
						};
					}
				}
			});

			Object.keys(voters).forEach(voter => {
				wrapper.accountHelper.getBalance(voter, (b) => {
					voters[voter].balance = (b / 100000);
				});
			});

			let countdown = 30;
			let tracker = setInterval(() => {
				let isGood = Object.values(voters).reduce((total, current) => {
					return total && current.balance != -1;
				}, true);

				if (isGood) {
					let results = { };
					config.options.forEach(it => {
						results[it.id] = {
							voteCount : 0,
							voteScore : 0
						};
					});

					Object.values(voters).forEach(voter => {
						voter.vote.forEach(vote => {
							results[vote].voteCount += 1;
							results[vote].voteScore += voter.balance;
						});
					});

					let obj = {
						height : wrapper.blockHeight,
						results : results,
						voters : voters
					};

					clearInterval(tracker);
					response.write(JSON.stringify(obj));
					response.end();
				} else if (--countdown <= 0) {
					clearInterval(tracker);
					response.write("ERROR COLLECTING VOTER BALANCES");
					response.end();
				}
			}, 250);

			return;
		} else {
			response.writeHead(404);
		}
	} else {
		response.writeHead(403);
	}

	response.end();
}

function startServer() {
	let server = null;

	if (keyRoot) {
		const https = require('https');
		let options = {
			key : fs.readFileSync(keyRoot + "privkey.pem"),
			cert : fs.readFileSync(keyRoot + "fullchain.pem")
		};

		server = https.createServer(options, onRequest);
	} else {
		const http = require('http');
		server = http.createServer(onRequest);
	}

	server.listen(port, () => {
		console.log("Launched at height " + wrapper.blockHeight);

		if (wrapper.blockHeight < config.endBlock) {
			wrapper.wrappedNode.network.connect();
		} else if (wrapper.blockHeight > config.endBlock) {
			rebranchToTarget();
		}
	});
}

function generateAddress(text) {
	let addr = text.toUpperCase().split(" ").join("0").split("I").join("1").split("W").join("3").split("Z").join("2").padEnd(32, "0");
	let iban = ("00" + (98 - Nimiq.Address._ibanCheck(addr + Nimiq.Address.CCODE + "00"))).slice(-2);
	let tempAddr = Nimiq.Address.CCODE + iban + addr;
	// By converting to an address and back to text, you take care of the IBAN wrap around with NQXX where XX>95
	let finalAddr = Nimiq.Address.fromUserFriendlyAddress(tempAddr).toUserFriendlyAddress();
	return finalAddr;
}

async function rebranchToTarget() {
	if (wrapper.blockHeight > config.endBlock && !branching) {
		branching = true;
		console.log("Rebranching to " + config.endBlock);

		let targetBlock = await wrapper.wrappedNode.blockchain.getBlockAt(config.endBlock, false);
		let targetHash = targetBlock._header._hash;
		let chainData = await wrapper.wrappedNode.blockchain._store.getChainDataAt(config.endBlock, true);

		await wrapper.wrappedNode.blockchain._rebranch(targetHash, chainData);
		console.log("Completed rebranch, must restart VoteServer");
		process.exit();
	}
}

function txToObj(tx, block = { height : -1 }) {
	return {
		from : tx.sender.toUserFriendlyAddress(),
		to : tx.recipient.toUserFriendlyAddress(),
		data : Nimiq.BufferUtils.toAscii(tx.data),
		height : block.height
	};
}

async function getTxByHash(hash) {
	const entry = await wrapper.wrappedNode.blockchain.getTransactionInfoByHash(hash);
	if (entry) {
		const block = await wrapper.wrappedNode.blockchain.getBlock(entry.blockHash, false, true);
		return txToObj(block.transactions[entry.index], block);
	}

	const mempoolTx = wrapper.wrappedNode.mempool.getTransaction(hash);
	if (mempoolTx) {
		return txToObj(mempoolTx);
	}

	return null;
}

async function getTransactionsByAddress(addr, limit = 1000) {
	const address = Nimiq.Address.fromString(addr);
	const receipts = await wrapper.wrappedNode.blockchain.getTransactionReceiptsByAddress(address, limit);
	const result = [];
	for (const r of receipts) {
		let tx = await getTxByHash(r.transactionHash);
		let height = parseInt(tx.height);
		if (tx && tx.to == addr && height >= config.startBlock && height <= config.endBlock) {
			result.push(tx);
		}
	}
	return result;
}
