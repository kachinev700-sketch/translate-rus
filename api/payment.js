// 🔐 БЕЗОПАСНОЕ ИСПОЛЬЗОВАНИЕ ПЕРЕМЕННЫХ ОКРУЖЕНИЯ
const API_KEY = process.env.QR_API_KEY_TRANSLATE_RUS;

// 🔥 ХРАНИЛИЩЕ ДЛЯ СООТВЕТСТВИЯ OPERATION_ID -> CALLBACK_ID
const paymentMappings = new Map();

// 🔥 ФУНКЦИЯ ДЛЯ ПРОВЕРКИ СТАТУСА ПЛАТЕЖА
async function checkPaymentStatus(operationId) {
  try {
    console.log(`🔍 Checking payment status for: ${operationId}`);
    
    // 🔥 ПРОВЕРЯЕМ, ЕСТЬ ЛИ СООТВЕТСТВИЕ С CALLBACK ID
    const callbackId = paymentMappings.get(operationId);
    if (callbackId) {
      console.log(`🎯 Found callback mapping: ${operationId} -> ${callbackId}`);
      
      const callbackStatus = await checkStatusById(callbackId);
      if (callbackStatus) {
        return callbackStatus;
      }
    }
    
    // 🔥 ПРОВЕРЯЕМ ЧЕРЕЗ ОСНОВНОЙ ENDPOINT
    const response = await fetch(`https://app.wapiserv.qrm.ooo/operations/${operationId}/qr-status/`, {
      method: "GET",
      headers: {
        "accept": "application/json",
        "X-Api-Key": API_KEY
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      const statusCode = data.results?.operation_status_code;
      
      if (statusCode === 5) {
        console.log('🎉 PAYMENT SUCCESSFUL!');
        return { 
          success: true, 
          status: 'paid'
        };
      }
    }
    
    return { 
      success: false, 
      status: 'pending'
    };
    
  } catch (error) {
    console.error('Error checking payment status:', error);
    return { 
      success: false, 
      status: 'error'
    };
  }
}

// 🔥 ФУНКЦИЯ ДЛЯ ПРОВЕРКИ ПО CALLBACK ID
async function checkStatusById(callbackId) {
  try {
    const response = await fetch(`https://app.wapiserv.qrm.ooo/operations/${callbackId}/qr-status/`, {
      method: "GET",
      headers: {
        "accept": "application/json",
        "X-Api-Key": API_KEY
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      const statusCode = data.results?.operation_status_code;
      
      if (statusCode === 5) {
        console.log('🎉 PAYMENT SUCCESSFUL via callback ID!');
        return { 
          success: true, 
          status: 'paid',
          fromCallback: true
        };
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error checking by callback ID:', error);
    return null;
  }
}

// 🔧 ТЕСТОВЫЙ ЗАПРОС ДЛЯ ДИАГНОСТИКИ API КЛЮЧА
async function testApiKey() {
  try {
    console.log('🧪 Testing API key...');
    const testPayload = {
      sum: 10000, // 100 рублей
      qr_size: 400,
      payment_purpose: "Тест"
    };

    console.log('🔧 Test payload:', testPayload);
    console.log('🔧 API Key:', API_KEY ? '***' + API_KEY.slice(-4) : 'NOT SET');

    const response = await fetch("https://app.wapiserv.qrm.ooo/operations/qr-code/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": API_KEY
      },
      body: JSON.stringify(testPayload)
    });

    console.log('🔧 Test API Response Status:', response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ API Key Test FAILED - Full error:', errorText);
      return {
        success: false,
        error: `API Key Test FAILED: ${response.status} ${response.statusText}`,
        details: errorText
      };
    }

    const result = await response.json();
    console.log('✅ API Key Test PASSED - Response:', JSON.stringify(result, null, 2));
    
    return {
      success: true,
      message: 'API Key Test PASSED',
      data: result
    };
    
  } catch (error) {
    console.error('💥 API Key Test ERROR:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = async (req, res) => {
  console.log('=== CREATIUM QR PAYMENT HANDLER ===');
  console.log('Method:', req.method);
  console.log('URL:', req.url);

  // 🔧 ТЕСТОВЫЙ ЭНДПОИНТ ДЛЯ ПРОВЕРКИ API КЛЮЧА
  if (req.method === 'GET' && req.url === '/test-api-key') {
    const testResult = await testApiKey();
    return res.status(testResult.success ? 200 : 500).json(testResult);
  }

  // Игнорируем запросы к favicon
  if (req.url.includes('favicon') || req.url.includes('.png') || req.url.includes('.ico')) {
    return res.status(404).json({ error: 'Not found' });
  }

  // Настраиваем CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Обрабатываем OPTIONS запрос
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Проверяем что API ключ загружен
  if (!API_KEY) {
    console.error('QR_API_KEY_PEREVOD is not set');
    return res.status(500).json({ success: false, error: 'API key not configured' });
  }

  console.log('API Key loaded:', API_KEY ? '***' + API_KEY.slice(-4) : 'NOT SET');

  // 🔥 ОБРАБОТКА CALLBACK ОТ ПЛАТЕЖНОЙ СИСТЕМЫ
  if (req.method === 'POST' && req.url.includes('/callback')) {
    try {
      console.log('💰 Payment callback received');
      
      let body = '';
      for await (const chunk of req) {
        body += chunk;
      }
      
      let callbackData = {};
      if (body && body.trim() !== '') {
        try {
          callbackData = JSON.parse(body);
          console.log('✅ Callback data received');
          
          // 🔥 СОХРАНЯЕМ СООТВЕТСТВИЕ ID
          const callbackId = callbackData.id;
          const urlParams = new URLSearchParams(req.url.split('?')[1]);
          const operationId = urlParams.get('operation_id');
          
          if (callbackId && operationId) {
            console.log(`💾 Saving payment mapping: ${operationId} -> ${callbackId}`);
            paymentMappings.set(operationId, callbackId);
          }
          
        } catch (parseError) {
          console.error('❌ Callback JSON parse error:', parseError);
        }
      }
      
      return res.status(200).json({ success: true, message: 'Callback received' });
      
    } catch (error) {
      console.error('💥 Callback error:', error);
      return res.status(200).json({ success: false, error: error.message });
    }
  }

  // 🔥 ОБРАБОТКА ПРОВЕРКИ СТАТУСА ПЛАТЕЖА
  if (req.method === 'POST' && req.url.includes('/check-status')) {
    try {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
      }
      
      const { operationId } = JSON.parse(body);
      console.log(`🔍 Status check for operation: ${operationId}`);
      
      if (!operationId) {
        return res.status(400).json({ success: false, error: 'Operation ID required' });
      }
      
      const statusResult = await checkPaymentStatus(operationId);
      console.log(`📋 Status result:`, statusResult);
      return res.status(200).json(statusResult);
      
    } catch (error) {
      console.error('💥 Status check error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  // 🔥 ОБРАБОТКА POST ОТ CREATIUM
  if (req.method === 'POST' && !req.url.includes('/callback') && !req.url.includes('/check-status')) {
    try {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
      }
      
      console.log('📨 Raw body from Creatium, length:', body.length);

      let data = {};
      if (body && body.trim() !== '') {
        try {
          data = JSON.parse(body);
          console.log('✅ Parsed Creatium data');
        } catch (parseError) {
          throw new Error('Invalid JSON from Creatium');
        }
      }
      
      const amountInRub = data.payment?.amount || data.cart?.subtotal || 100;
      const amountForQR = Math.round(amountInRub * 100);
      const paymentId = data.payment?.id || `creatium_${Date.now()}`;
      const orderId = data.order?.id || 'unknown';
      
      const successUrl = `https://translate-rus.ru/payment-success?order_id=${orderId}&payment_id=${paymentId}&status=success&paid=true`;
      const failUrl = `https://translate-rus.ru/payment-failed?order_id=${orderId}&status=failed&paid=false`;

      // 🔥 ГЕНЕРИРУЕМ QR КОД
      const payload = {
        sum: amountForQR,
        qr_size: 400,
        payment_purpose: "Оплата услуг перевода с иностранных языков",
        notification_url: `https://translate-rus.vercel.app/api/callback?order_id=${orderId}&operation_id=${paymentId}`
      };

      console.log('🚀 Generating QR code...');
      const qrResponse = await fetch("https://app.wapiserv.qrm.ooo/operations/qr-code/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": API_KEY
        },
        body: JSON.stringify(payload)
      });

      if (!qrResponse.ok) {
        throw new Error(`QR service error: ${qrResponse.status}`);
      }

      const qrResult = await qrResponse.json();
      console.log('✅ QR generated');
      
      const operationId = qrResult.results?.operation_id || paymentId;
      console.log('🎯 Operation ID:', operationId);

      // 🔥 СОЗДАЕМ ЧИСТУЮ СТРАНИЦУ ДЛЯ ПОКУПАТЕЛЯ
      const htmlForm = createCleanPaymentPage(orderId, operationId, amountInRub, qrResult.results.qr_img, successUrl, failUrl);
      
      const response = {
        success: true,
        form: htmlForm,
        url: `https://translate-rus.vercel.app/?sum=${amountInRub}&order_id=${orderId}&operation_id=${operationId}`,
        amount: amountInRub,
        order_id: orderId,
        payment_id: paymentId,
        operation_id: operationId
      };

      console.log('✅ Response to Creatium');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(200).json(response);

    } catch (error) {
      console.error('❌ Payment processing error:', error);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(200).json({
        success: false,
        error: error.message
      });
    }
  }

  // 🔥 ОБРАБОТКА GET ЗАПРОСА
  if (req.method === 'GET' && !req.url.includes('favicon') && !req.url.includes('.png')) {
    try {
      const urlParams = new URLSearchParams(req.url.split('?')[1]);
      const sum = urlParams.get('sum');
      const order_id = urlParams.get('order_id');
      const operation_id = urlParams.get('operation_id');

      console.log('GET request:', { sum, order_id, operation_id });

      if (sum && order_id && operation_id) {
        console.log('Generating payment page with callback support');
        
        const amountInRub = parseFloat(sum);
        const successUrl = `https://translate-rus.ru/payment-success?order_id=${order_id}&operation_id=${operation_id}&status=success&paid=true`;
        const failUrl = `https://translate-rus.ru/payment-failed?order_id=${order_id}&status=failed&paid=false`;

        // Генерируем QR код
        const amountForQR = Math.round(amountInRub * 100);
        const payload = {
          sum: amountForQR,
          qr_size: 400,
          payment_purpose: "Оплата услуг перевода с иностранных языков",
          notification_url: `https://translate-rus.vercel.app/api/callback?order_id=${order_id}&operation_id=${operation_id}`
        };

        const qrResponse = await fetch("https://app.wapiserv.qrm.ooo/operations/qr-code/", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Api-Key": API_KEY
          },
          body: JSON.stringify(payload)
        });

        if (!qrResponse.ok) {
          throw new Error(`QR service error: ${qrResponse.status}`);
        }

        const qrResult = await qrResponse.json();
        
        const html = createCleanPaymentPage(order_id, operation_id, amountInRub, qrResult.results.qr_img, successUrl, failUrl);
        
        res.setHeader('Content-Type', 'text/html');
        return res.status(200).send(html);
      }

      // Простой тест для GET без параметров
      const amountInRub = 100;
      const amountForQR = Math.round(amountInRub * 100);
      const payload = {
        sum: amountForQR,
        qr_size: 400,
        payment_purpose: "Оплата услуг перевода с иностранных языков",
        notification_url: 'https://translate-rus.vercel.app/api/callback'
      };

      const qrResponse = await fetch("https://app.wapiserv.qrm.ooo/operations/qr-code/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": API_KEY
        },
        body: JSON.stringify(payload)
      });

      if (!qrResponse.ok) {
        throw new Error(`QR service error: ${qrResponse.status}`);
      }

      const qrResult = await qrResponse.json();
      const operationId = qrResult.results?.operation_id || `test_${Date.now()}`;
      const successUrl = `https://translate-rus.ru/payment-success?order_id=test&operation_id=${operationId}&status=success&paid=true`;
      const failUrl = `https://translate-rus.ru/payment-failed?order_id=test&status=failed&paid=false`;

      const html = createCleanPaymentPage('test', operationId, amountInRub, qrResult.results.qr_img, successUrl, failUrl);

      res.setHeader('Content-Type', 'text/html');
      return res.status(200).send(html);

    } catch (error) {
      console.error('GET Error:', error);
      res.setHeader('Content-Type', 'text/html');
      return res.status(200).send(`<html><body><h2>Error: ${error.message}</h2></body></html>`);
    }
  }

  return res.status(404).json({ error: 'Not found' });
};

// 🔥 ЧИСТАЯ СТРАНИЦА ДЛЯ ПОКУПАТЕЛЯ
function createCleanPaymentPage(orderId, operationId, amountInRub, qrImage, successUrl, failUrl) {
  // ... твоя существующая функция createCleanPaymentPage ...
  return `... твой HTML код ...`;
}
