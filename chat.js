(function () {
  'use strict';

  const GREETING = "Hey! I'm Alexis, SLN Enterprise's 24/7 assistant 👋 Whether it's noon or 3am, I'm here to help. What can I do for you today?";

  let history = [];
  let isTyping = false;

  /* ── Build the widget HTML into the existing #chat-panel ── */
  function buildWidget() {
    const panel = document.getElementById('chat-panel');
    const bubble = document.getElementById('chat-bubble');
    if (!panel || !bubble) return;

    panel.innerHTML = `
      <div class="cw-header">
        <div class="cw-avatar">S</div>
        <div class="cw-info">
          <div class="cw-name">Alexis · SLN Enterprise</div>
          <div class="cw-status"><span class="cw-dot"></span> AI assistant — always on</div>
        </div>
        <button class="cw-close" id="cw-close" aria-label="Close chat">✕</button>
      </div>
      <div class="cw-messages" id="cw-messages"></div>
      <div class="cw-input-row">
        <input
          type="text"
          id="cw-input"
          placeholder="Ask me anything…"
          autocomplete="off"
          maxlength="500"
        />
        <button id="cw-send" aria-label="Send message">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
    `;

    // Wire up events
    document.getElementById('cw-close').addEventListener('click', closeChat);
    bubble.addEventListener('click', toggleChat);

    const input = document.getElementById('cw-input');
    const sendBtn = document.getElementById('cw-send');
    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });

    // Show greeting after slight delay
    setTimeout(() => addBotMessage(GREETING), 400);
  }

  /* ── Toggle / open / close ── */
  function toggleChat() {
    const panel = document.getElementById('chat-panel');
    const bubble = document.getElementById('chat-bubble');
    if (panel.classList.contains('cw-open')) {
      closeChat();
    } else {
      panel.classList.add('cw-open');
      bubble.classList.add('cw-active');
      hideBadge();
      setTimeout(() => document.getElementById('cw-input')?.focus(), 300);
    }
  }

  function closeChat() {
    document.getElementById('chat-panel').classList.remove('cw-open');
    document.getElementById('chat-bubble').classList.remove('cw-active');
  }

  function hideBadge() {
    const b = document.querySelector('.cw-badge');
    if (b) b.style.display = 'none';
  }

  /* ── Render a bot message ── */
  function addBotMessage(text) {
    const msgs = document.getElementById('cw-messages');
    if (!msgs) return;
    removeTypingIndicator();
    const el = document.createElement('div');
    el.className = 'cw-msg cw-msg-bot';
    el.innerHTML = `<div class="cw-bubble">${escHtml(text)}</div>`;
    msgs.appendChild(el);
    scrollToBottom();
    history.push({ role: 'assistant', content: text });
  }

  /* ── Render a user message ── */
  function addUserMessage(text) {
    const msgs = document.getElementById('cw-messages');
    if (!msgs) return;
    const el = document.createElement('div');
    el.className = 'cw-msg cw-msg-user';
    el.innerHTML = `<div class="cw-bubble">${escHtml(text)}</div>`;
    msgs.appendChild(el);
    scrollToBottom();
  }

  /* ── Typing indicator ── */
  function showTypingIndicator() {
    const msgs = document.getElementById('cw-messages');
    if (!msgs) return;
    removeTypingIndicator();
    const el = document.createElement('div');
    el.className = 'cw-msg cw-msg-bot cw-typing-row';
    el.id = 'cw-typing';
    el.innerHTML = `<div class="cw-bubble cw-typing"><span></span><span></span><span></span></div>`;
    msgs.appendChild(el);
    scrollToBottom();
  }

  function removeTypingIndicator() {
    document.getElementById('cw-typing')?.remove();
  }

  /* ── Send a message to the AI ── */
  async function sendMessage() {
    if (isTyping) return;
    const input = document.getElementById('cw-input');
    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    addUserMessage(text);
    history.push({ role: 'user', content: text });

    isTyping = true;
    setSendDisabled(true);
    showTypingIndicator();

    const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    const chatEndpoint = isLocal ? '/api/chat' : '/.netlify/functions/chat';

    try {
      const res = await fetch(chatEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history.slice(-20) }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        addBotMessage(data.error || "Sorry, I'm having a hiccup. Please try again or call us at (206) 555-0100!");
      } else {
        addBotMessage(data.reply);
      }
    } catch {
      addBotMessage("Hmm, I lost my connection for a second. Please try again or reach us at (206) 555-0100!");
    } finally {
      isTyping = false;
      setSendDisabled(false);
      document.getElementById('cw-input')?.focus();
    }
  }

  function setSendDisabled(val) {
    const btn = document.getElementById('cw-send');
    if (btn) btn.disabled = val;
  }

  function scrollToBottom() {
    const msgs = document.getElementById('cw-messages');
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
  }

  function escHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
  }

  /* ── Inject widget CSS ── */
  function injectStyles() {
    if (document.getElementById('cw-styles')) return;
    const style = document.createElement('style');
    style.id = 'cw-styles';
    style.textContent = `
      /* bubble button */
      #chat-bubble {
        position: fixed; bottom: 1.5rem; right: 1.5rem; z-index: 1000;
        width: 58px; height: 58px; border-radius: 50%;
        background: #C8963E; border: none; cursor: pointer;
        box-shadow: 0 8px 28px rgba(200,150,62,.45);
        display: flex; align-items: center; justify-content: center;
        font-size: 1.55rem; transition: transform .2s, box-shadow .2s;
        color: #0B1628;
      }
      #chat-bubble:hover { transform: scale(1.08); box-shadow: 0 12px 36px rgba(200,150,62,.55); }
      #chat-bubble.cw-active { background: #0B1628; color: #C8963E; }
      .cw-badge {
        position: absolute; top: -3px; right: -3px;
        background: #EF4444; color: #fff; border-radius: 50%;
        width: 19px; height: 19px; font-size: .65rem; font-weight: 700;
        display: flex; align-items: center; justify-content: center;
        border: 2px solid #fff; pointer-events: none;
      }

      /* panel */
      #chat-panel {
        position: fixed; bottom: 5.5rem; right: 1.5rem; z-index: 1000;
        width: 360px; background: #fff; border-radius: 16px;
        box-shadow: 0 24px 64px rgba(0,0,0,.18);
        display: flex; flex-direction: column; overflow: hidden;
        opacity: 0; pointer-events: none; transform: translateY(12px);
        transition: opacity .25s ease, transform .25s ease;
        max-height: 540px;
      }
      #chat-panel.cw-open {
        opacity: 1; pointer-events: all; transform: translateY(0);
      }

      /* header */
      .cw-header {
        background: #0B1628; padding: 1rem 1.1rem;
        display: flex; align-items: center; gap: .85rem; flex-shrink: 0;
      }
      .cw-avatar {
        width: 40px; height: 40px; border-radius: 50%; flex-shrink: 0;
        background: #C8963E; color: #0B1628;
        display: flex; align-items: center; justify-content: center;
        font-family: 'Playfair Display', serif; font-weight: 700; font-size: 1rem;
      }
      .cw-name { font-size: .88rem; font-weight: 600; color: #fff; margin-bottom: 2px; }
      .cw-status { font-size: .7rem; color: rgba(255,255,255,.5); display: flex; align-items: center; gap: .35rem; }
      .cw-dot { width: 7px; height: 7px; border-radius: 50%; background: #22c55e; flex-shrink: 0; }
      .cw-close {
        margin-left: auto; background: none; border: none;
        color: rgba(255,255,255,.45); cursor: pointer; font-size: 1rem;
        padding: 4px 6px; border-radius: 4px; transition: color .15s;
        flex-shrink: 0;
      }
      .cw-close:hover { color: #fff; }

      /* messages */
      .cw-messages {
        flex: 1; overflow-y: auto; padding: 1.1rem;
        display: flex; flex-direction: column; gap: .65rem;
        background: #F8F6F2; min-height: 0;
        scroll-behavior: smooth;
      }
      .cw-messages::-webkit-scrollbar { width: 4px; }
      .cw-messages::-webkit-scrollbar-track { background: transparent; }
      .cw-messages::-webkit-scrollbar-thumb { background: #d1ccc3; border-radius: 4px; }

      .cw-msg { display: flex; }
      .cw-msg-bot { justify-content: flex-start; }
      .cw-msg-user { justify-content: flex-end; }

      .cw-bubble {
        max-width: 82%; padding: .65rem .9rem;
        font-size: .84rem; line-height: 1.6;
        border-radius: 14px;
      }
      .cw-msg-bot .cw-bubble {
        background: #fff; color: #1A1A2E;
        border: 1px solid #e5e7eb; border-bottom-left-radius: 4px;
      }
      .cw-msg-user .cw-bubble {
        background: #0B1628; color: #fff;
        border-bottom-right-radius: 4px;
      }

      /* typing dots */
      .cw-typing { display: flex; align-items: center; gap: 5px; padding: .7rem .9rem; }
      .cw-typing span {
        display: block; width: 7px; height: 7px; border-radius: 50%;
        background: #C8963E; opacity: .4;
        animation: cwBounce 1.2s infinite ease-in-out;
      }
      .cw-typing span:nth-child(2) { animation-delay: .2s; }
      .cw-typing span:nth-child(3) { animation-delay: .4s; }
      @keyframes cwBounce {
        0%, 80%, 100% { transform: scale(.8); opacity: .4; }
        40% { transform: scale(1); opacity: 1; }
      }

      /* input row */
      .cw-input-row {
        display: flex; align-items: center; gap: .5rem;
        padding: .75rem 1rem; border-top: 1px solid #f0ede8;
        background: #fff; flex-shrink: 0;
      }
      #cw-input {
        flex: 1; border: 1.5px solid #e5e7eb; border-radius: 8px;
        padding: .6rem .85rem; font-family: 'Inter', sans-serif;
        font-size: .84rem; color: #1A1A2E; background: #fafafa;
        outline: none; transition: border-color .2s;
      }
      #cw-input:focus { border-color: #C8963E; background: #fff; }
      #cw-send {
        width: 38px; height: 38px; border-radius: 8px; flex-shrink: 0;
        background: #C8963E; border: none; cursor: pointer; color: #0B1628;
        display: flex; align-items: center; justify-content: center;
        transition: background .2s, transform .15s;
      }
      #cw-send:hover { background: #E8B660; transform: scale(1.05); }
      #cw-send:disabled { opacity: .45; cursor: not-allowed; transform: none; }

      @media (max-width: 480px) {
        #chat-panel { width: calc(100vw - 2rem); right: 1rem; bottom: 5rem; }
        #chat-bubble { right: 1rem; bottom: 1rem; }
      }
    `;
    document.head.appendChild(style);
  }

  /* ── Init ── */
  function init() {
    injectStyles();
    buildWidget();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
