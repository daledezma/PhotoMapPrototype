// PhotoMap front end: MetaMask + ethers.js
let contract;
const previews = {}; // hash -> image data URL (this session only; real version loads from IPFS)

const $ = (id) => document.getElementById(id);
const status = (msg, type = "secondary") => {
  $("status").className = `alert alert-${type} small`;
  $("status").textContent = msg;
};

// 1. Connect MetaMask and load the contract
async function connect() {
  if (!window.ethereum) return status("MetaMask not found. Install the browser extension.", "danger");

  const provider = new ethers.BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  const signer = await provider.getSigner();
  const account = await signer.getAddress();
  $("account").textContent = account.slice(0, 6) + "…" + account.slice(-4);

  // ABI + address come from Truffle's build output (written by `migrate`)
  const artifact = await (await fetch("../build/contracts/PhotoMap.json")).json();
  const networkId = await provider.send("net_version", []);
  const deployed = artifact.networks[networkId];
  if (!deployed) return status(`PhotoMap is not deployed on network ${networkId}. Run migrate and check MetaMask's network.`, "warning");

  contract = new ethers.Contract(deployed.address, artifact.abi, signer);
  status(`Connected to PhotoMap at ${deployed.address}`, "success");
  loadPhotos();
}

// 2. Read photos: getPhotoCount() + photos(i)  (view calls, no gas)
async function loadPhotos() {
  const count = Number(await contract.getPhotoCount());
  $("count").textContent = count;
  const list = $("photoList");
  list.innerHTML = count ? "" : '<li class="list-group-item text-muted">No photos yet.</li>';

  for (let i = 0; i < count; i++) {
    const p = await contract.photos(i);
    const li = document.createElement("li");
    li.className = "list-group-item d-flex justify-content-between align-items-center";
    const img = previews[p.ipfsHash]
      ? `<img src="${previews[p.ipfsHash]}" class="rounded me-3" style="width:48px;height:48px;object-fit:cover" alt="">`
      : `<div class="rounded me-3 bg-secondary-subtle" style="width:48px;height:48px"></div>`;
    li.innerHTML = `
      <div class="d-flex align-items-center">${img}<div>
        <div class="fw-semibold">#${i} · ${p.location}</div>
        <div class="small text-muted">${p.ipfsHash} · owner ${p.owner.slice(0, 6)}…${p.owner.slice(-4)}</div>
      </div></div>
      <button class="btn btn-outline-danger btn-sm">♥ ${p.likes}</button>`;
    li.querySelector("button").onclick = () => likePhoto(i);
    list.appendChild(li);
  }
}

// 3. Write: addPhoto(ipfsHash, location)  (transaction, MetaMask confirms)
async function addPhoto(e) {
  e.preventDefault();
  if (!contract) return status("Connect MetaMask first.", "warning");
  try {
    status("Confirm the transaction in MetaMask…", "info");
    const tx = await contract.addPhoto($("ipfsHash").value.trim(), $("location").value.trim());
    await tx.wait();
    status(`Photo pinned. Tx: ${tx.hash}`, "success");
    e.target.reset();
    resetDrop();
    loadPhotos();
  } catch (err) {
    status(err.shortMessage || err.message, "danger");
  }
}

// 4. Write: likePhoto(id)
async function likePhoto(id) {
  try {
    status("Confirm the like in MetaMask…", "info");
    const tx = await contract.likePhoto(id);
    await tx.wait();
    status(`Liked photo #${id}. Tx: ${tx.hash}`, "success");
    loadPhotos();
  } catch (err) {
    status(err.shortMessage || err.message, "danger");
  }
}

// 5. Drag-and-drop photo upload
// Prototype: hashes the file locally (keccak256) as a stand-in for the IPFS CID.
// Final version: upload to IPFS (e.g. Pinata) and use the CID it returns.
const dropZone = $("dropZone"), fileInput = $("fileInput");

async function handleFile(file) {
  if (!file || !file.type.startsWith("image/")) return status("Please choose an image file.", "warning");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const hash = ethers.keccak256(bytes);
  const url = URL.createObjectURL(file);
  previews[hash] = url;
  $("ipfsHash").value = hash;
  $("preview").src = url;
  $("preview").classList.remove("d-none");
  $("dropText").innerHTML = `<span class="small">${file.name} · ${(file.size / 1024).toFixed(0)} KB</span>`;
}

function resetDrop() {
  $("preview").classList.add("d-none");
  $("dropText").innerHTML = 'Drag &amp; drop a photo here<br><span class="small">or click to choose a file</span>';
}

dropZone.onclick = () => fileInput.click();
fileInput.onchange = () => handleFile(fileInput.files[0]);
["dragenter", "dragover"].forEach((ev) =>
  dropZone.addEventListener(ev, (e) => { e.preventDefault(); dropZone.classList.add("bg-primary-subtle"); }));
["dragleave", "drop"].forEach((ev) =>
  dropZone.addEventListener(ev, (e) => { e.preventDefault(); dropZone.classList.remove("bg-primary-subtle"); }));
dropZone.addEventListener("drop", (e) => handleFile(e.dataTransfer.files[0]));

$("connectBtn").onclick = connect;
$("addForm").onsubmit = addPhoto;
if (window.ethereum) window.ethereum.on("accountsChanged", connect);

