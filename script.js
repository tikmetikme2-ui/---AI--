// Глобальные переменные для хранения истории
let chatHistory = [];
let messageCount = 0;

// Системный промт репетитора
const SYSTEM_PROMPT = `Ты — опытный и терпеливый репетитор по имени "Экзамус". Твоя задача — помогать студентам готовиться к экзаменам. Ты специализируешься на трех типах запросов:

1. **Объяснение темы:** Если пользователь просит что-то объяснить, делай это простым и понятным языком, используя аналогии и примеры. Спроси, насколько глубоко нужно раскрыть тему.

2. **Проверка знаний:** Если пользователь говорит "задай вопрос" или "проверь меня", задай ему вопрос по указанной теме. Проанализируй его ответ, укажи на ошибки и похвали за правильные части.

3. **Создание материалов:** Если пользователь просит "создай шпаргалку" или "конспект", предоставь структурированный, краткий материал с ключевыми формулами, датами или определениями.

Всегда уточни предмет (история, математика, биология и т.д.) и конкретную тему. Будь поддерживающим, но строгим. Поощряй пользователя и мотивируй его продолжать подготовку.`;

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
  loadChatHistory();
  setupTabs();
  
  document.getElementById('send-btn').onclick = sendMessage;
  document.getElementById('clear-history-btn').onclick = clearHistory;
  
  document.getElementById('user-input').addEventListener('keydown', function(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });
});

// Настройка вкладок
function setupTabs() {
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');
  
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const tabId = button.getAttribute('data-tab');
      
      // Убираем активный класс у всех кнопок и контента
      tabButtons.forEach(btn => btn.classList.remove('active'));
      tabContents.forEach(content => content.classList.remove('active'));
      
      // Добавляем активный класс к выбранной кнопке и контенту
      button.classList.add('active');
      document.getElementById(`${tabId}-tab`).classList.add('active');
      
      // Если открываем вкладку истории, обновляем ее
      if (tabId === 'history') {
        displayHistory();
      }
    });
  });
}

// Отправка сообщения
async function sendMessage() {
  const inputElement = document.getElementById('user-input');
  const input = inputElement.value.trim();
  
  if (!input) return;
  
  // Очищаем поле ввода
  inputElement.value = '';
  
  // Добавляем сообщение пользователя в историю
  addMessageToHistory('user', input);
  
  // Отображаем сообщение в чате
  displayUserMessage(input);
  
  // Показываем индикатор загрузки
  showLoadingIndicator();
  
  // Формируем запрос с историей (последние 9 сообщений + текущее)
  const recentHistory = getRecentHistory();
  
  const request = {
    "model": "gemma3:1b",
    "messages": [
      {
        "role": "system",
        "content": SYSTEM_PROMPT
      },
      ...recentHistory,
      {
        "role": "user",
        "content": input
      }
    ],
    'max_tokens': '1000',
    "temperature": "0.3"
  };

  // Отправка запроса к AI (Ollama)
  try {
    const response = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(request)
    });
    
    // Обработка потокового ответа
    const reader = response.body.getReader();
    let result = '';
    hideLoadingIndicator();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      try {
        let chunk = new TextDecoder().decode(value, { stream: true });
        let response_chunk = JSON.parse(chunk);
        
        if (response_chunk.message && response_chunk.message.content) {
          result += response_chunk.message.content;
          updateAssistantMessage(result);
        }
      } catch (e) {
        console.log(e);
      }
    }
    
    // Сохраняем полный ответ в историю
    addMessageToHistory('assistant', result);
    
    // Проверяем и очищаем историю при необходимости
    checkAndClearHistory();
    
  } catch (e) {
    hideLoadingIndicator();
    const errorMsg = "❌ Ошибка подключения к AI сервису. Убедитесь, что Ollama запущена на localhost:11434";
    updateAssistantMessage(errorMsg);
    addMessageToHistory('assistant', errorMsg);
    console.log(e);
  }
}

// Получить последние сообщения из истории для контекста
function getRecentHistory() {
  // Берем последние 9 сообщений (чтобы вместе с текущим было 10)
  const startIndex = Math.max(0, chatHistory.length - 9);
  return chatHistory.slice(startIndex).map(msg => ({
    role: msg.sender === 'user' ? 'user' : 'assistant',
    content: msg.content
  }));
}

// Добавить сообщение в историю
function addMessageToHistory(sender, content) {
  const message = {
    sender: sender,
    content: content,
    timestamp: new Date().toLocaleString('ru-RU')
  };
  
  chatHistory.push(message);
  messageCount++;
  
  // Сохраняем историю в localStorage
  saveChatHistory();
  
  // Обновляем счетчик сообщений на кнопке истории
  updateHistoryCounter();
}

// Проверить и очистить историю каждые 15 сообщений
function checkAndClearHistory() {
  if (messageCount >= 15) {
    // Оставляем только последние 3 сообщения для сохранения контекста
    chatHistory = chatHistory.slice(-3);
    messageCount = chatHistory.length;
    
    // Сохраняем обновленную историю
    saveChatHistory();
    updateHistoryCounter();
    
    // Показываем уведомление
    alert("История чата была частично очищена для оптимизации. Последние сообщения сохранены.");
  }
}

// Отобразить сообщение пользователя в чате
function displayUserMessage(message) {
  const chatMessages = document.getElementById('chat-messages');
  const messageElement = document.createElement('div');
  messageElement.className = 'message user-message';
  messageElement.innerHTML = `<strong>Студент:</strong> ${message}`;
  chatMessages.appendChild(messageElement);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Показать индикатор загрузки
function showLoadingIndicator() {
  const chatMessages = document.getElementById('chat-messages');
  const loadingElement = document.createElement('div');
  loadingElement.id = 'loading-indicator';
  loadingElement.className = 'message assistant-message';
  loadingElement.innerHTML = '<strong>Экзамус:</strong> <em>Думает над ответом...</em>';
  chatMessages.appendChild(loadingElement);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Скрыть индикатор загрузки
function hideLoadingIndicator() {
  const loadingElement = document.getElementById('loading-indicator');
  if (loadingElement) {
    loadingElement.remove();
  }
}

// Обновить сообщение ассистента в реальном времени
function updateAssistantMessage(message) {
  const chatMessages = document.getElementById('chat-messages');
  let messageElement = document.getElementById('assistant-last-message');
  
  if (!messageElement) {
    messageElement = document.createElement('div');
    messageElement.id = 'assistant-last-message';
    messageElement.className = 'message assistant-message';
    chatMessages.appendChild(messageElement);
  }
  
  messageElement.innerHTML = `<strong>Экзамус:</strong> ${message}`;
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Отобразить историю во вкладке истории
function displayHistory() {
  const historyContainer = document.getElementById('history-container');
  historyContainer.innerHTML = '';
  
  if (chatHistory.length === 0) {
    historyContainer.innerHTML = '<p>История занятий пуста.</p>';
    return;
  }
  
  chatHistory.forEach((msg, index) => {
    const messageElement = document.createElement('div');
    messageElement.className = `history-message ${msg.sender}-message`;
    messageElement.innerHTML = `
      <div class="message-header">
        <strong>${msg.sender === 'user' ? 'Студент' : 'Экзамус'}</strong>
        <span class="timestamp">${msg.timestamp}</span>
      </div>
      <div class="message-content">${msg.content}</div>
    `;
    historyContainer.appendChild(messageElement);
  });
}

// Обновить счетчик сообщений на кнопке истории
function updateHistoryCounter() {
  const historyButton = document.querySelector('[data-tab="history"]');
  historyButton.textContent = `История занятий (${chatHistory.length})`;
}

// Сохранить историю в localStorage
function saveChatHistory() {
  localStorage.setItem('examusChatHistory', JSON.stringify(chatHistory));
  localStorage.setItem('examusMessageCount', messageCount.toString());
}

// Загрузить историю из localStorage
function loadChatHistory() {
  const savedHistory = localStorage.getItem('examusChatHistory');
  const savedCount = localStorage.getItem('examusMessageCount');
  
  if (savedHistory) {
    chatHistory = JSON.parse(savedHistory);
    messageCount = savedCount ? parseInt(savedCount) : chatHistory.length;
    updateHistoryCounter();
    
    // Восстанавливаем последние сообщения в чате
    const recentMessages = chatHistory.slice(-5);
    const chatMessages = document.getElementById('chat-messages');
    
    recentMessages.forEach(msg => {
      const messageElement = document.createElement('div');
      messageElement.className = `message ${msg.sender}-message`;
      messageElement.innerHTML = `<strong>${msg.sender === 'user' ? 'Студент' : 'Экзамус'}:</strong> ${msg.content}`;
      chatMessages.appendChild(messageElement);
    });
  }
}

// Очистить всю историю
function clearHistory() {
  if (confirm("Вы уверены, что хотите очистить всю историю занятий?")) {
    chatHistory = [];
    messageCount = 0;
    saveChatHistory();
    updateHistoryCounter();
    displayHistory();
    
    // Очищаем чат и показываем приветственное сообщение
    const chatMessages = document.getElementById('chat-messages');
    chatMessages.innerHTML = '<div class="message assistant-message"><strong>Экзамус:</strong> Привет! Я твой AI-репетитор. Я помогу тебе подготовиться к экзаменам. Могу объяснять темы, проверять знания и создавать учебные материалы. С чего начнем?</div>';
  }
}