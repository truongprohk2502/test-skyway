const Peer = window.Peer;

const localVideo = document.getElementById("js-local-stream");
const joinTrigger = document.getElementById("js-join-trigger");
const leaveTrigger = document.getElementById("js-leave-trigger");
const startTrigger = document.getElementById("js-start-trigger");
const requireWebcamTrigger = document.getElementById("js-require-webcam");
const remoteVideos = document.getElementById("js-remote-streams");
const roomId = document.getElementById("js-room-id");
const roomMode = document.getElementById("js-room-mode");
const localText = document.getElementById("js-local-text");
const sendTrigger = document.getElementById("js-send-trigger");
const messages = document.getElementById("js-messages");
const meta = document.getElementById("js-meta");
const sdkSrc = document.querySelector("script[src*=skyway]");

const handleTalking = async () => {
  console.log("run start talking");

  meta.innerText = `
    UA: ${navigator.userAgent}
    SDK: ${sdkSrc ? sdkSrc.src : "unknown"}
  `.trim();

  const getRoomModeByHash = () => (location.hash === "#sfu" ? "sfu" : "mesh");

  const requireWebcam = requireWebcamTrigger.checked;

  roomMode.textContent = getRoomModeByHash();
  window.addEventListener(
    "hashchange",
    () => (roomMode.textContent = getRoomModeByHash())
  );

  let audioTrack;
  let videoTrack;

  if (requireWebcam) {
    const videoStream = await navigator.mediaDevices
      .getUserMedia({ video: true })
      .catch(console.error);
    videoTrack = videoStream.getVideoTracks()[0];

    const audioStream = await navigator.mediaDevices
      .getUserMedia({ audio: true })
      .catch(console.error);
    audioTrack = audioStream.getAudioTracks()[0];
  } else {
    const audioStream = await navigator.mediaDevices
      .getUserMedia({ audio: true })
      .catch(console.error);
    audioTrack = audioStream.getAudioTracks()[0];
  }

  const localStream = new MediaStream(
    requireWebcam ? [videoTrack, audioTrack] : [audioTrack]
  );

  // Render local stream
  localVideo.muted = true;
  localVideo.srcObject = localStream;
  localVideo.playsInline = true;
  await localVideo.play().catch(console.error);

  // eslint-disable-next-line require-atomic-updates
  const peer = (window.peer = new Peer({
    key: window.__SKYWAY_KEY__,
    debug: 3,
  }));

  // Register join handler
  joinTrigger.addEventListener("click", () => {
    // Note that you need to ensure the peer has connected to signaling server
    // before using methods of peer instance.
    if (!peer.open) {
      return;
    }

    console.log("send stream");
    console.log(localStream.getTracks());

    const room = peer.joinRoom(roomId.value, {
      mode: getRoomModeByHash(),
      stream: localStream,
    });

    room.once("open", () => {
      messages.textContent += "=== You joined ===\n";
    });
    room.on("peerJoin", (peerId) => {
      messages.textContent += `=== ${peerId} joined ===\n`;
    });

    // Render remote stream for new peer join in the room
    room.on("stream", async (stream) => {
      console.log("receive stream");
      console.log(stream.getTracks());
      const newVideo = document.createElement("video");
      newVideo.srcObject = stream;
      newVideo.playsInline = true;
      // mark peerId to find it later at peerLeave event
      newVideo.setAttribute("data-peer-id", stream.peerId);
      remoteVideos.append(newVideo);
      await newVideo.play().catch(console.error);
    });

    room.on("data", ({ data, src }) => {
      // Show a message sent to the room and who sent
      messages.textContent += `${src}: ${data}\n`;
    });

    // for closing room members
    room.on("peerLeave", (peerId) => {
      const remoteVideo = remoteVideos.querySelector(
        `[data-peer-id="${peerId}"]`
      );
      remoteVideo.srcObject.getTracks().forEach((track) => track.stop());
      remoteVideo.srcObject = null;
      remoteVideo.remove();

      messages.textContent += `=== ${peerId} left ===\n`;
    });

    // for closing myself
    room.once("close", () => {
      sendTrigger.removeEventListener("click", onClickSend);
      messages.textContent += "== You left ===\n";
      Array.from(remoteVideos.children).forEach((remoteVideo) => {
        remoteVideo.srcObject.getTracks().forEach((track) => track.stop());
        remoteVideo.srcObject = null;
        remoteVideo.remove();
      });
    });

    sendTrigger.addEventListener("click", onClickSend);
    leaveTrigger.addEventListener("click", () => room.close(), { once: true });

    function onClickSend() {
      // Send message to all of the peers in the room via websocket
      room.send(localText.value);

      messages.textContent += `${peer.id}: ${localText.value}\n`;
      localText.value = "";
    }
  });

  peer.on("error", console.error);
};

startTrigger.addEventListener("click", handleTalking);
