// knack-integration.js - Safe for public GitHub repository
(function () {
    // Look for configuration in global scope
    if (!window.VESPA_CONFIG) {
      console.error("Flashcard app: Missing VESPA_CONFIG. Please define configuration in Knack.");
      return;
    }
    
    // Safe URI component decoding function to handle malformed URI components
    function safeDecodeURIComponent(str) {
      if (!str) return str;
      try {
        return decodeURIComponent(str.replace(/\+/g, ' ')); // Handle plus signs as spaces too
      } catch (error) {
        console.error("Flashcard app: Error decoding URI component:", error, "String:", str);
        
        // Try to fix common issues with % encoding
        try {
          // Replace any standalone % characters with %25 (properly encoded % symbol)
          const cleaned = str.replace(/%(?![0-9A-Fa-f]{2})/g, '%25');
          return decodeURIComponent(cleaned);
        } catch (secondError) {
          console.error("Flashcard app: Second attempt to decode failed:", secondError);
          // If all decoding attempts fail, return the original string
          return str;
        }
      }
    }
    
    // Safely encode URI component, handling potential errors
    function safeEncodeURIComponent(str) {
      try {
        // First, ensure the input is a string
        const stringToEncode = String(str);
        return encodeURIComponent(stringToEncode);
      } catch (e) {
        console.error("Error encoding URI component:", e, "Input:", str);
        // Fallback: return the original string or an empty string if it's problematic
        return String(str);
      }
    }
    
    // Safe JSON parsing function with error recovery
    function safeParseJSON(jsonString) {
      if (!jsonString) return null;
      
      try {
        // If it's already an object, just return it
        if (typeof jsonString === 'object') return jsonString;
        
        // Regular JSON parse
        return JSON.parse(jsonString);
      } catch (error) {
        console.error("Flashcard app: Error parsing JSON:", error, "String:", jsonString.substring(0, 100));
        
        // Try recovery methods for common JSON issues
        try {
          // Try to clean up the JSON string
          const cleaned = jsonString
            .replace(/\\"/g, '"')        // Fix escaped quotes
            .replace(/"\s+/g, '"')       // Remove whitespace after quotes
            .replace(/\s+"/g, '"')       // Remove whitespace before quotes
            .replace(/,\s*}/g, '}')      // Remove trailing commas in objects
            .replace(/,\s*\]/g, ']');    // Remove trailing commas in arrays
            
          return JSON.parse(cleaned);
        } catch (secondError) {
          console.error("Flashcard app: JSON recovery failed:", secondError);
          
          // Last resort - return empty object/array
          if (jsonString.trim().startsWith('[')) return [];
          return {};
        }
      }
    }
  
    // Extract configuration (defined in Knack's JavaScript, not here)
    const knackAppId = window.VESPA_CONFIG.knackAppId;
    const knackApiKey = window.VESPA_CONFIG.knackApiKey;
    const KNACK_API_URL = 'https://api.knack.com/v1';
    const FLASHCARD_APP_CONFIG = window.VESPA_CONFIG.appConfig || {
      'scene_1206': {
        'view_3005': {
          appType: 'flashcard-app',
          elementSelector: '.kn-rich-text',
          appUrl: window.VESPA_CONFIG.appUrl || 'https://vespa-flashcards-e7f31e9ff3c9.herokuapp.com/'
        }
      }
    };
  
  // Object and field definitions
  const FLASHCARD_OBJECT = 'object_102'; // Your flashcard object
  const FIELD_MAPPING = {
  userId: 'field_2954',           // User ID
  userEmail: 'field_2958',        // User email
  accountConnection: 'field_2956', // Connection to account
  vespaCustomer: 'field_3008',    // VESPA Customer Connection
  tutorConnection: 'field_3009',  // Tutor Connection
  cardBankData: 'field_2979',     // Flashcard Bank JSON Store
  lastSaved: 'field_2957',        // Date Last Saved
  box1Data: 'field_2986',         // Box 1 JSON
  box2Data: 'field_2987',         // Box 2 JSON
  box3Data: 'field_2988',         // Box 3 JSON
  box4Data: 'field_2989',         // Box 4 JSON
  box5Data: 'field_2990',         // Box 5 JSON
  colorMapping: 'field_3000',     // Color Mapping
  topicLists: 'field_3011',       // Topic Lists JSON - ADDED THIS
  topicMetadata: 'field_3030',    // Topic Metadata JSON - ADDED THIS
  userName: 'field_3010',         // User Name - ADDED THIS
  tutorGroup: 'field_565',        // Tutor Group - ADDED THIS
  yearGroup: 'field_548',         // Year Group - ADDED THIS
  userRole: 'field_73'            // User Role - ADDED THIS
  };
  
  // Initialize app when the specific scene renders
  $(document).on('knack-scene-render.scene_1206', function(event, scene) {
  console.log("Flashcard app: Scene rendered:", scene.key);
  initializeFlashcardApp();
  });
  
  // Check if a string is a valid Knack record ID
  function isValidKnackId(id) {
  if (!id) return false;
  // Knack IDs are 24-character hexadecimal strings
  return typeof id === 'string' && id.match(/^[0-9a-f]{24}$/i);
  }
  
  // Extract a valid record ID from various formats
  function extractValidRecordId(value) {
  if (!value) return null;
  
  // If it's already an object with an id
  if (typeof value === 'object' && value.id) {
    // Clean and check the id inside the object
    const cleanedId = cleanHtmlFromId(value.id);
    return isValidKnackId(cleanedId) ? cleanedId : null;
  }
  
  // If it's a string
  if (typeof value === 'string') {
    const cleanedId = cleanHtmlFromId(value);
    return isValidKnackId(cleanedId) ? cleanedId : null;
  }
  
  return null;
  }
  
  // Helper function to ensure an item has a type and split items by type
  function getSyncService() {
    // If TopicCardSyncService is available in the window object, use it
    if (window.TopicCardSyncService) {
      return window.TopicCardSyncService;
    }
    
    // Fallback implementation
    return {
      ensureItemType: (item) => {
        if (!item) return item;
        
        if (item.type) return item;
        
        if (item.topicId || item.question || item.front || item.back || item.boxNum) {
          return {...item, type: 'card'};
        } else if (item.name || item.topic || item.isShell === true) {
          return {...item, type: 'topic'};
        }
        
        return {...item, type: 'card'};
      },
      splitByType: (items) => {
        if (!Array.isArray(items)) {
          return { topics: [], cards: [] };
        }
        
        const ensureType = (item) => {
          if (!item.type) {
            return getSyncService().ensureItemType(item);
          }
          return item;
        };
        
        const typedItems = items.map(ensureType);
        
        const topics = typedItems.filter(item => item.type === 'topic');
        const cards = typedItems.filter(item => item.type !== 'topic');
        
        return { topics, cards };
      }
    };
  }
  
  // Helper function to clean HTML from IDs
  function cleanHtmlFromId(idString) {
  if (!idString) return null;
  
  // If it's already an object with an id
  if (typeof idString === 'object' && idString.id) {
    // Clean the id inside the object
    return { id: cleanHtmlFromId(idString.id) };
  }
  
  // Convert to string if it's not already
  const str = idString.toString();
  
  // Check if it contains HTML
  if (str.includes('<')) {
    console.log("Flashcard app: Cleaning HTML from ID:", str);
    
    // If it's wrapped in a span with a class that looks like an ID
    const spanMatch = str.match(/<span class="([^"]+)">([^<]+)<\/span>/);
    if (spanMatch) {
      console.log("Flashcard app: Extracted ID from span class:", spanMatch[1]);
      return spanMatch[1]; // Use the class as the ID, which is often the real ID
    }
    
    // Otherwise just strip all HTML
    const cleanStr = str.replace(/<[^>]+>/g, '').trim();
    console.log("Flashcard app: Stripped HTML from ID:", cleanStr);
    return cleanStr;
  }
  
  return str;
  }
  
  // Safely remove HTML from strings to avoid issues with connected fields
  function sanitizeField(value) {
  if (!value) return "";
  if (typeof value !== 'string') return String(value);
  
  // Remove HTML tags
  return value.replace(/<[^>]*>/g, "")
    // Remove any markdown characters
    .replace(/[*_~`#]/g, "")
    // Replace special chars with their text equivalents
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .trim();
  }
  
  // Debug logging helper
  function debugLog(title, data) {
  console.log(`%c${title}`, 'color: #5d00ff; font-weight: bold; font-size: 12px;');
  console.log(JSON.stringify(data, null, 2));
  return data; // Return data for chaining
  }
  
  // Get complete user data from Knack
  function getCompleteUserData(userId, callback) {
  console.log("Flashcard app: Getting complete user data for:", userId);
  
  $.ajax({
    url: KNACK_API_URL + '/objects/object_3/records/' + userId,
    type: 'GET',
    headers: {
      'X-Knack-Application-Id': knackAppId,
      'X-Knack-REST-API-Key': knackApiKey,
      'Authorization': Knack.getUserToken(),
      'Content-Type': 'application/json'
    },
    success: function(response) {
      console.log("Flashcard app: Complete user data:", response);
      
      // Store this data for later use
      window.completeUserData = response;
      
      callback(response);
    },
    error: function(error) {
      console.error("Flashcard app: Error retrieving complete user data:", error);
      callback(null);
    }
  });
  }
  
  // --- Central Message Handler Logic (Helper) ---
  // Handles specific message types delegated from the main listener
  function _handleIframeMessageLogic(type, data, iframeWindow, context) {
    // Basic validation already done by the caller
    console.log(`Flashcard app: Delegated handling for type: ${type}`);
    const { user, currentUser, loadingDiv, iframeElement } = context; // Unpack context
    let addToBankInProgress = false; // Local state for this handler
  
    switch (type) {
      case 'AUTH_CONFIRMED':
        console.log("Flashcard app: Authentication confirmed by React app");
        // Use context to access DOM elements
        if (loadingDiv) loadingDiv.style.display = 'none';
        if (iframeElement) iframeElement.style.display = 'block';
        break;
  
      case 'SAVE_DATA':
        console.log(`Flashcard app [${new Date().toISOString()}]: Saving data from React app:`, data);
        debugLog("SAVE_DATA REQUEST RECEIVED (Delegated)", {
            preserveFields: data?.preserveFields,
            hasRecordId: data?.recordId ? "yes" : "no",
            timestamp: new Date().toISOString()
        });
        // Call the existing save handler (ensure it's accessible)
        handleSaveData(data);
        // Notify about queueing (this might need refinement if handleSaveData provides status)
        if (iframeWindow) {
            iframeWindow.postMessage({ type: 'SAVE_OPERATION_QUEUED', timestamp: new Date().toISOString() }, '*');
        }
        break;
  
      // --- Merged Cases Start Here ---
      case 'ADD_TO_BANK':
        console.log("Flashcard app: Adding cards to bank:", data);
        if (addToBankInProgress) {
          console.log("Add to bank operation already in progress, ignoring duplicate request");
          return;
        }
        addToBankInProgress = true;
        // Use the Promise-based approach
        handleAddToBankPromise(data)
          .then((result) => { // The callback now receives an object
            console.log("Flashcard app: ADD_TO_BANK successful", result);
            if (iframeWindow) {
              iframeWindow.postMessage({
                type: 'ADD_TO_BANK_RESULT',
                success: true,
                shouldReload: result.shouldReload // Use the result object
              }, '*');
            }
            // Optionally trigger data request after a delay if needed
            // Consider if this is still necessary or if shouldReload is sufficient
            // setTimeout(() => {
            //   if (iframeWindow) {
            //     iframeWindow.postMessage({ type: 'REQUEST_UPDATED_DATA', recordId: data?.recordId }, '*');
            //   }
            // }, 2000);
          })
          .catch((error) => {
            console.error("Failed to add cards to bank:", error);
            if (iframeWindow) {
              iframeWindow.postMessage({
                type: 'ADD_TO_BANK_RESULT',
                success: false,
                error: error.message
              }, '*');
            }
          })
          .finally(() => {
            addToBankInProgress = false; // Reset flag
          });
        break;
  
      case 'TOPIC_LISTS_UPDATED':
        console.log(`Flashcard app [${new Date().toISOString()}]: Message from React app: TOPIC_LISTS_UPDATED`);
        debugLog("MESSAGE RECEIVED (Delegated)", {
            type: "TOPIC_LISTS_UPDATED",
            timestamp: new Date().toISOString(),
            hasData: data ? "yes" : "no"
        });
        if (data && data.topicLists && data.recordId) {
            console.log(`Flashcard app [${new Date().toISOString()}]: Creating topic shells for updated topic lists`);
            createTopicShellsFromLists(data.topicLists, data.recordId);
            // Consider if reload is still needed or if React handles update
            // setTimeout(() => { window.location.reload(); }, 2000);
        } else {
            // Fallback: load data if not provided in message
            const userId = user.id;
            loadFlashcardUserData(userId, function(userData) {
                if (userData && userData.recordId && userData.topicLists && userData.topicLists.length > 0) {
                    console.log(`Flashcard app [${new Date().toISOString()}]: Creating topic shells from loaded topic lists`);
                    createTopicShellsFromLists(userData.topicLists, userData.recordId);
                    // setTimeout(() => { window.location.reload(); }, 2000);
                } else {
                    console.warn(`Flashcard app [${new Date().toISOString()}]: No topic lists found for shell creation`);
                }
            });
        }
        break;
  
      case 'TRIGGER_SAVE': // This might be obsolete if React handles state internally
        console.log("Flashcard app: Triggered save from React app (delegated)");
        // Potentially trigger a specific save operation if needed, e.g., save card bank
        // Consider if this message is still required
        if (data && data.cards && Array.isArray(data.cards) && data.cards.length > 0) {
          console.log("Trigger save included cards, potentially adding to bank...")
          // Calling handleAddToBank here might be redundant if React manages this
          // handleAddToBankPromise(data).catch(e => console.error("Error in triggered add to bank:", e));
        }
        break;
  
      case 'RELOAD_APP_DATA':
        console.log(`Flashcard app [${new Date().toISOString()}]: Received reload request (delegated)`);
        if (iframeWindow) {
          const reloadUserId = user.id;
          loadFlashcardUserData(reloadUserId, function(userData) {
            if (userData) {
              console.log(`Flashcard app [${new Date().toISOString()}]: Sending refreshed data to React app`);
              iframeWindow.postMessage({
                type: 'KNACK_DATA', // Send as KNACK_DATA for React app to update
                cards: userData.cards || [],
                colorMapping: userData.colorMapping || {},
                topicLists: userData.topicLists || [],
                topicMetadata: userData.topicMetadata || [],
                recordId: userData.recordId,
                auth: { id: user.id, email: user.email, name: user.name || '' },
                timestamp: new Date().toISOString()
              }, '*');
            } else {
              console.error(`Flashcard app [${new Date().toISOString()}]: Error loading updated data for reload`);
              iframeWindow.postMessage({ type: 'DATA_REFRESH_ERROR', error: 'Failed to load data for reload' }, '*');
            }
          });
        } else {
          console.log(`Flashcard app [${new Date().toISOString()}]: No iframe window, falling back to page reload`);
          window.location.reload();
        }
        break;
  
      case 'AUTH_REFRESH_NEEDED':
        console.log(`Flashcard app [${new Date().toISOString()}]: Authentication refresh needed (delegated)`);
        try {
          const currentToken = Knack.getUserToken();
          if (currentToken && iframeWindow) {
            console.log(`Flashcard app [${new Date().toISOString()}]: Refreshing authentication with current token`);
            iframeWindow.postMessage({
              type: 'AUTH_REFRESH',
              data: { token: currentToken, userId: user.id, email: user.email, name: user.name || '' },
              timestamp: new Date().toISOString()
            }, '*');
            console.log(`Flashcard app [${new Date().toISOString()}]: Sent refreshed auth token to React app`);
          } else {
            console.error(`Flashcard app [${new Date().toISOString()}]: Cannot refresh token - not available from Knack or no iframe`);
            // Optionally force reload if token cannot be sent
            // setTimeout(() => { window.location.reload(); }, 1000);
          }
        } catch (error) {
          console.error(`Flashcard app [${new Date().toISOString()}]: Error refreshing authentication:`, error);
          // Optionally force reload
          // setTimeout(() => { window.location.reload(); }, 1000);
        }
        break;
  
      case 'REQUEST_TOKEN_REFRESH': // Uses handleTokenRefresh defined elsewhere
        console.log("Flashcard app: Delegated token refresh request");
        handleTokenRefresh(); // Assumes handleTokenRefresh sends message back
        break;
  
      case 'REQUEST_UPDATED_DATA':
        console.log(`Flashcard app [${new Date().toISOString()}]: Requested updated data (delegated)`);
        const dataUserId = user.id;
        const dataRecordId = data?.recordId; // Get recordId from the message data
        if (!dataRecordId) {
            console.error("Flashcard app: Cannot refresh data - missing record ID in request");
            if (iframeWindow) {
              iframeWindow.postMessage({ type: 'DATA_REFRESH_ERROR', error: 'Missing record ID in request' }, '*');
            }
            return;
        }
        loadFlashcardUserData(dataUserId, function(userData) {
            if (userData && iframeWindow) {
                console.log(`Flashcard app [${new Date().toISOString()}]: Sending refreshed data to React app (on request)`);
                iframeWindow.postMessage({
                    type: 'KNACK_DATA',
                    cards: userData.cards || [],
                    colorMapping: userData.colorMapping || {},
                    topicLists: userData.topicLists || [],
                    topicMetadata: userData.topicMetadata || [],
                    recordId: dataRecordId,
                    auth: { id: user.id, email: user.email, name: user.name || '' },
                    timestamp: new Date().toISOString()
                }, '*');
            } else if (iframeWindow) {
                console.error(`Flashcard app [${new Date().toISOString()}]: Error loading updated data (on request)`);
                iframeWindow.postMessage({ type: 'DATA_REFRESH_ERROR', error: 'Failed to load data' }, '*');
            }
        });
        break;
  
      case 'REQUEST_RECORD_ID':
        console.log(`Flashcard app [${new Date().toISOString()}]: Record ID requested from React app (delegated)`);
        const currentUserId = user.id;
        loadFlashcardUserData(currentUserId, function(userData) {
            if (userData && userData.recordId && iframeWindow) {
                console.log(`Flashcard app [${new Date().toISOString()}]: Found record ID for user: ${userData.recordId}`);
                iframeWindow.postMessage({
                    type: 'RECORD_ID_RESPONSE',
                    recordId: userData.recordId,
                    timestamp: new Date().toISOString()
                }, '*');
            } else if (iframeWindow) {
                console.error(`Flashcard app [${new Date().toISOString()}]: Could not find record ID for user ${currentUserId}`);
                iframeWindow.postMessage({
                    type: 'RECORD_ID_ERROR',
                    error: 'Record ID not found',
                    timestamp: new Date().toISOString()
                }, '*');
            }
        });
        break;
      // --- Merged Cases End Here ---
  
      // --- Remove Obsolete Case --- 
      // case 'PERSISTENCE_SERVICES_READY': 
      //   console.log("Flashcard app: Ignoring obsolete PERSISTENCE_SERVICES_READY message.");
      //   break;
  
      default:
        console.log(`Flashcard app: Unhandled message type in _handleIframeMessageLogic: ${type}`);
        break;
    }
  }
  
  // Initialize the React app
  function initializeFlashcardApp() {
  console.log("Initializing Flashcard React app");
  
  // Get config for this scene/view
  const config = FLASHCARD_APP_CONFIG['scene_1206']['view_3005'];
  
  // Check if user is authenticated
  if (typeof Knack !== 'undefined' && Knack.getUserToken()) {
    console.log("Flashcard app: User is authenticated");
    
    // Get user data
    const userToken = Knack.getUserToken();
    const appId = Knack.application_id;
    const user = Knack.getUserAttributes();
    
    console.log("Flashcard app: Basic user info:", user);
    
    // Store the current user globally for later use
    window.currentKnackUser = user;
    
    // Get complete user data including role information
    getCompleteUserData(user.id, function(completeUserData) {
      if (completeUserData) {
        // Enhance the stored user info
        window.currentKnackUser = Object.assign({}, user, completeUserData);
        continueInitialization();
      } else {
        console.log("Flashcard app: Could not get complete user data, continuing with basic info");
        continueInitialization();
      }
    });
    
    function continueInitialization() {
      // Extract and store connection field IDs
      const currentUser = window.currentKnackUser;
      
      // Add connection field IDs to the user object
      currentUser.emailId = extractValidRecordId(currentUser.id); // User's own ID from Object_3 / field_70
      currentUser.schoolId = extractValidRecordId(currentUser.school); // School ID from Object_2 / Field_44
      currentUser.tutorId = extractValidRecordId(currentUser.tutor); // Tutor ID from object_7 / field_96
      currentUser.roleId = extractValidRecordId(currentUser.role); // Role ID
      
      // Log the connection field IDs
      debugLog("CONNECTION FIELD IDs", {
        emailId: currentUser.emailId,
        schoolId: currentUser.schoolId, 
        tutorId: currentUser.tutorId,
        roleId: currentUser.roleId
      });
      
      // Find or create a container for the app
      let container = document.querySelector(config.elementSelector);
    
      // If that doesn't work, try to find any rich text field
      if (!container) {
        console.log("Flashcard app: First selector failed, trying alternatives");
        container = document.querySelector('.kn-rich-text');
      }
      
      // If that still doesn't work, find the view and create a container
      if (!container) {
        console.log("Flashcard app: No rich text field found, looking for the view");
        const view = document.getElementById('view_3005') || document.querySelector('.view_3005');
        
        if (view) {
          console.log("Flashcard app: View found, creating container");
          container = document.createElement('div');
          container.id = 'flashcard-app-container';
          container.style.margin = '20px 0';
          view.appendChild(container);
        }
      }
      
      // Final fallback - just add to the scene
      if (!container) {
        console.log("Flashcard app: No suitable container found, adding to scene");
        const scene = document.getElementById('kn-scene_1206');
        if (scene) {
          container = document.createElement('div');
          container.id = 'flashcard-app-container';
          container.style.margin = '20px 0';
          scene.appendChild(container);
        } else {
          console.error("Flashcard app: Cannot find any suitable container for the app");
          return;
        }
      }
      
      // Clear any existing content
      container.innerHTML = '';
      
      // Create a loading indicator
      const loadingDiv = document.createElement('div');
      loadingDiv.className = 'app-loading';
      loadingDiv.innerHTML = '<p>Loading your flashcard app...</p>';
      loadingDiv.style.padding = '20px';
      loadingDiv.style.textAlign = 'center';
      container.appendChild(loadingDiv);
      
      // Create an iframe for the React app
      const iframe = document.createElement('iframe');
      iframe.id = 'flashcard-app-iframe';
      iframe.style.width = '100%';
      iframe.style.height = '800px'; // Adjust as needed
      iframe.style.border = 'none';
      iframe.style.display = 'none'; // Hide initially until loaded
      iframe.src = config.appUrl;
      container.appendChild(iframe);
      
      // Track authentication status
      let authSent = false;
      
      // Track message processing to prevent loops
      let appReadyHandled = false;
      let authConfirmReceived = false;
      
      // Set up message listener for communication with the iframe
      window.addEventListener('message', function(event) {
        // Only accept messages from our iframe
        if (event.source !== iframe.contentWindow) {
          return;
        }
        
        // Basic data check
        if (!event.data || !event.data.type) {
            return;
        }
  
        const { type, data } = event.data;
        const iframeWindow = iframe.contentWindow;
        
        // Prepare context for delegated cases (static info)
        const messageContext = {
          user: user,
          currentUser: currentUser, 
          loadingDiv: loadingDiv,
          iframeElement: iframe
          // Add other static context if needed by delegated handlers
        };
  
        // Log message receipt (can be refined later)
        if (type !== 'PING') { 
          console.log(`Flashcard app [${new Date().toISOString()}]: Message listener received:`, type);
        }
  
        // Use a structure that handles stateful cases inline 
        // and delegates stateless ones
        if (type === 'APP_READY') {
          // Handle APP_READY directly due to state (appReadyHandled, authSent)
          if (appReadyHandled) {
            console.log("Flashcard app: Ignoring duplicate APP_READY message");
            return;
          }
          appReadyHandled = true;
          console.log("Flashcard app: React app is ready, loading Knack data..."); // <-- MODIFIED LOG
          
          loadFlashcardUserData(user.id, function(userData) {
            if (authSent) {
              console.log("Flashcard app: Auth already sent, skipping duplicate send");
              return;
            }
            const userDataToSend = {
              id: user.id,
              email: user.email,
              name: user.name || '',
              token: userToken,
              appId: appId,
              userData: userData || {},
              emailId: currentUser.emailId,
              schoolId: currentUser.schoolId,
              tutorId: currentUser.tutorId,
              roleId: currentUser.roleId
            };
            if (iframeWindow) {
              console.log("Flashcard app: ---> SENDING KNACK_USER_INFO to React app", userDataToSend); // <-- ADDED LOG
              iframeWindow.postMessage({ type: 'KNACK_USER_INFO', data: userDataToSend }, '*');
            }
            authSent = true;
            console.log("Flashcard app: Sent KNACK_USER_INFO to React app"); // <-- MODIFIED LOG
          });
        }
        // --- Remove Obsolete Case --- 
        // else if (type === 'PERSISTENCE_SERVICES_READY') { 
        //   console.log("Flashcard app: Ignoring obsolete PERSISTENCE_SERVICES_READY message.");
        // }
         else { 
          // Delegate other message types to the helper function
          _handleIframeMessageLogic(type, data, iframeWindow, messageContext);
        }
      });
    }
  } else {
    console.error("Flashcard app: User is not authenticated");
  }
  }
  
  // Load user data from Knack
  function loadFlashcardUserData(userId, callback) {
    console.log("Flashcard app: Loading user data for:", userId);
  
    // Direct API call to fetch the user's record
    const findRecordApiCall = () => {
      return new Promise((resolve, reject) => {
        $.ajax({
          url: KNACK_API_URL + '/objects/' + FLASHCARD_OBJECT + '/records',
          type: 'GET',
          headers: {
            'X-Knack-Application-Id': knackAppId,
            'X-Knack-REST-API-Key': knackApiKey,
            'Authorization': Knack.getUserToken(),
            'Content-Type': 'application/json'
          },
          data: {
            format: 'raw', // Important: Use raw format to get field IDs correctly
            filters: JSON.stringify({
              match: 'and',
              rules: [
                {
                  field: FIELD_MAPPING.userId,
                  operator: 'is',
                  value: userId
                }
              ]
            })
          },
          success: function(response) {
            resolve(response);
          },
          error: function(error) {
            reject(error);
          }
        });
      });
    };
  
    // Use retry mechanism for the API call
    retryApiCall(findRecordApiCall)
      .then((response) => {
        console.log("Flashcard app: User data search response:", response);
  
        if (response.records && response.records.length > 0) {
          // User has existing data
          const record = response.records[0];
          console.log("Flashcard app: Found existing user data record:", record.id);
          debugLog("RAW RECORD DATA LOADED", record);
  
          let userData = {
            recordId: record.id,
            cards: [],
            spacedRepetition: { box1: [], box2: [], box3: [], box4: [], box5: [] },
            topicLists: [],
            colorMapping: {}
            // Note: We are not explicitly loading topicMetadata (field_3030) here,
            // assuming it might be derived or managed elsewhere now.
            // If it is still needed, add logic to load it here.
          };
  
          try {
            // --- Load Card Bank Data (field_2979) ---
            if (record[FIELD_MAPPING.cardBankData]) {
              let cardData = record[FIELD_MAPPING.cardBankData];
              if (typeof cardData === 'string' && cardData.includes('%')) {
                cardData = safeDecodeURIComponent(cardData);
              }
              let cardArray = safeParseJSON(cardData) || [];
              cardArray = migrateTypeToQuestionType(cardArray); // Ensure legacy types are handled
              cardArray = standardizeCards(cardArray); // Ensure cards have standard structure
              userData.cards = cardArray;
              console.log(`Flashcard app: Loaded ${userData.cards.length} cards/shells from ${FIELD_MAPPING.cardBankData}`);
            }
  
            // --- Load Spaced Repetition Data (field_2986 - field_2990) ---
            const boxFields = [
              FIELD_MAPPING.box1Data, FIELD_MAPPING.box2Data, FIELD_MAPPING.box3Data,
              FIELD_MAPPING.box4Data, FIELD_MAPPING.box5Data
            ];
            boxFields.forEach((fieldKey, index) => {
              const boxNum = index + 1;
              if (record[fieldKey]) {
                let boxData = record[fieldKey];
                if (typeof boxData === 'string' && boxData.includes('%')) {
                  boxData = safeDecodeURIComponent(boxData);
                }
                userData.spacedRepetition[`box${boxNum}`] = safeParseJSON(boxData) || [];
                console.log(`Flashcard app: Loaded ${userData.spacedRepetition[`box${boxNum}`].length} items for Box ${boxNum} from ${fieldKey}`);
              }
            });
  
            // --- Load Topic Lists Data (field_3011) ---
            if (record[FIELD_MAPPING.topicLists]) {
              let topicListData = record[FIELD_MAPPING.topicLists];
              if (typeof topicListData === 'string' && topicListData.includes('%')) {
                topicListData = safeDecodeURIComponent(topicListData);
              }
              userData.topicLists = safeParseJSON(topicListData) || [];
              console.log(`Flashcard app: Loaded ${userData.topicLists.length} topic lists from ${FIELD_MAPPING.topicLists}`);
            }
  
            // --- Load Color Mapping Data (field_3000) ---
            if (record[FIELD_MAPPING.colorMapping]) {
              let colorData = record[FIELD_MAPPING.colorMapping];
              if (typeof colorData === 'string' && colorData.includes('%')) {
                colorData = safeDecodeURIComponent(colorData);
              }
              userData.colorMapping = safeParseJSON(colorData) || {};
              console.log(`Flashcard app: Loaded color mapping from ${FIELD_MAPPING.colorMapping}`);
            }
  
            debugLog("ASSEMBLED USER DATA", userData);
            callback(userData);
  
          } catch (e) {
            console.error("Flashcard app: Error parsing user data fields:", e);
            // Attempt to return partially loaded data or fallback
            callback(userData); // Return whatever was successfully parsed
          }
  
        } else {
          // No existing data, create a new record
          console.log("Flashcard app: No existing user data found, creating new record");
          createFlashcardUserRecord(userId, function(success, recordId) {
            if (success) {
              // Return the default empty structure
              callback({
                recordId: recordId,
                cards: [],
                spacedRepetition: { box1: [], box2: [], box3: [], box4: [], box5: [] },
                topicLists: [],
                colorMapping: {}
              });
            } else {
              callback(null); // Indicate failure
            }
          });
        }
      })
      .catch((error) => {
        console.error("Flashcard app: Error loading user data after retries:", error);
        callback(null); // Indicate failure
      });
  }
  
  // Create a new flashcard user record
  function createFlashcardUserRecord(userId, callback) {
  console.log("Flashcard app: Creating new flashcard user record for:", userId);
  
  // Get the current user
  const user = window.currentKnackUser;
  
  // Prepare the data
  const data = {
    [FIELD_MAPPING.userId]: userId,
    [FIELD_MAPPING.userEmail]: sanitizeField(user.email), // Plain text email field
    [FIELD_MAPPING.lastSaved]: new Date().toISOString(),
    [FIELD_MAPPING.cardBankData]: JSON.stringify([]),
    [FIELD_MAPPING.box1Data]: JSON.stringify([]),
    [FIELD_MAPPING.box2Data]: JSON.stringify([]),
    [FIELD_MAPPING.box3Data]: JSON.stringify([]),
    [FIELD_MAPPING.box4Data]: JSON.stringify([]),
    [FIELD_MAPPING.box5Data]: JSON.stringify([]),
    [FIELD_MAPPING.colorMapping]: JSON.stringify({}),
    [FIELD_MAPPING.topicLists]: JSON.stringify([]),
    [FIELD_MAPPING.topicMetadata]: JSON.stringify([]),
    [FIELD_MAPPING.userName]: sanitizeField(user.name || "")
  };
  
  // Add non-connection fields
  if (user.tutorGroup) data[FIELD_MAPPING.tutorGroup] = sanitizeField(user.tutorGroup);
  if (user.yearGroup) data[FIELD_MAPPING.yearGroup] = sanitizeField(user.yearGroup);
  
  // Only add connection fields if they have valid IDs
  // Email connection field (field_2956) - only add if it's a valid ID
  const emailId = extractValidRecordId(user.id); // User's own ID is used for email connection
  if (emailId) {
    data[FIELD_MAPPING.accountConnection] = emailId;
  }
  
  // VESPA Customer/school (field_3008) - only add if it's a valid ID 
  const schoolId = extractValidRecordId(user.school || user.field_122);
  if (schoolId) {
    data[FIELD_MAPPING.vespaCustomer] = schoolId;
  }
  
  // Tutor connection (field_3009) - only add if it's a valid ID
  const tutorId = extractValidRecordId(user.tutor);
  if (tutorId) {
    data[FIELD_MAPPING.tutorConnection] = tutorId;
  }
  
  // User Role (field_73) - only add if it's a valid ID
  const roleId = extractValidRecordId(user.role);
  if (roleId) {
    data[FIELD_MAPPING.userRole] = roleId;
  }
  
  // Add debug logging for created record
  debugLog("CREATING NEW RECORD", data);
  
  // Create the record
  $.ajax({
    url: KNACK_API_URL + '/objects/' + FLASHCARD_OBJECT + '/records',
    type: 'POST',
    headers: {
      'X-Knack-Application-Id': knackAppId,
      'X-Knack-REST-API-Key': knackApiKey,
      'Authorization': Knack.getUserToken(),
      'Content-Type': 'application/json'
    },
    data: JSON.stringify(data),
    success: function(response) {
      console.log("Flashcard app: Successfully created user record:", response);
      callback(true, response.id);
    },
    error: function(error) {
      console.error("Flashcard app: Error creating user record:", error);
      callback(false);
    }
  });
  }
  
  // Safe check for circular references in data
  function ensureDataIsSerializable(obj) {
  try {
    // Test if the object can be serialized
    JSON.stringify(obj);
    return obj;
  } catch (e) {
    console.error("Flashcard app: Data contains circular references or non-serializable values", e);
    
    // Create a stripped down copy
    const cache = new Set();
    const safeObj = JSON.parse(JSON.stringify(obj, (key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (cache.has(value)) {
          // Circular reference found, discard key
          return '[Circular]';
        }
        cache.add(value);
      }
      return value;
    }));
    
    return safeObj;
  }
  }
  
  // Standardize card data before saving
  function standardizeCards(cards) {
    if (!Array.isArray(cards)) return [];
  
    return cards.map(card => {
      // Deep clone to avoid modifying original object
      card = JSON.parse(JSON.stringify(card));
      
      // If it's already a standard card, just verify/fix the multiple choice settings
      if (card.createdAt && card.updatedAt && card.examBoard !== undefined) {
        // Detect if this should be a multiple choice card
        const isMultipleChoice = isMultipleChoiceCard(card);
        
        // Correct the questionType fields for multiple choice cards
        if (isMultipleChoice) {
          card.questionType = 'multiple_choice';
          
          // Remove 'type' field if it's used for question format
          if (card.type === 'multiple_choice' || card.type === 'short_answer') {
            delete card.type;
          }
          
          // Restore or create options if missing
          if (!card.options || !Array.isArray(card.options) || card.options.length === 0) {
            // Try to restore from savedOptions first
            if (card.savedOptions && Array.isArray(card.savedOptions) && card.savedOptions.length > 0) {
              console.log(`KnackJavascript4: Restored options from savedOptions for card ${card.id}`);
              card.options = [...card.savedOptions];
            } else {
              // Extract options from answer text as a fallback
              const extractedOptions = extractOptionsFromAnswer(card);
              if (extractedOptions.length > 0) {
                console.log(`KnackJavascript4: Created options from answer text for card ${card.id}`);
                card.options = extractedOptions;
                card.savedOptions = [...extractedOptions];
              }
            }
          }
          
          // Make a backup of options in savedOptions
          if (card.options && Array.isArray(card.options) && card.options.length > 0) {
            card.savedOptions = [...card.options];
          }
        }
        
        return card;
      }
  
      // Create a standardized version of the card
      let standardCard = {
        id: card.id || `card_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`,
        subject: card.subject || 'General',
        topic: card.topic || 'General',
        examBoard: card.examBoard || '',
        examType: card.examType || '',
        topicPriority: card.topicPriority || 0,
        question: card.question || card.front || '',
        answer: card.answer || card.back || '',
        keyPoints: card.keyPoints || [],
        detailedAnswer: card.detailedAnswer || '',
        additionalInfo: card.additionalInfo || card.notes || '',
        cardColor: card.cardColor || card.color || '#3cb44b',
        textColor: card.textColor || '',
        boxNum: card.boxNum || 1,
        lastReviewed: card.lastReviewed || null,
        nextReviewDate: card.nextReviewDate || new Date(Date.now() + 86400000).toISOString(),
        createdAt: card.createdAt || new Date().toISOString(),
        updatedAt: card.updatedAt || new Date().toISOString()
      };
      
      // If this is an entity type (e.g., 'topic' or 'card'), preserve it
      if (card.type === 'topic' || card.type === 'card' || card.type === 'shell') {
        standardCard.type = card.type;
      }
      
      // Detect if this should be a multiple choice card
      const isMultipleChoice = isMultipleChoiceCard(standardCard);
      
      // Set appropriate fields for multiple choice cards
      if (isMultipleChoice) {
        standardCard.questionType = 'multiple_choice';
        
        // Use existing options or try to extract them from the answer
        if (card.options && Array.isArray(card.options) && card.options.length > 0) {
          standardCard.options = [...card.options];
          standardCard.savedOptions = [...card.options];
        } else if (card.savedOptions && Array.isArray(card.savedOptions) && card.savedOptions.length > 0) {
          standardCard.options = [...card.savedOptions];
          standardCard.savedOptions = [...card.savedOptions];
        } else {
          // Extract options from answer text
          const extractedOptions = extractOptionsFromAnswer(standardCard);
          if (extractedOptions.length > 0) {
            console.log(`KnackJavascript4: Created options from answer text for new card`);
            standardCard.options = extractedOptions;
            standardCard.savedOptions = [...extractedOptions];
          }
        }
      } else {
        standardCard.questionType = card.questionType || 'short_answer';
      }
      
      return standardCard;
    });
  }
  
  // Helper function to detect multiple choice cards
  function isMultipleChoiceCard(card) {
    // Case 1: Card has options array
    if (card.options && Array.isArray(card.options) && card.options.length > 0) {
      return true;
    }
    
    // Case 2: Card has savedOptions array
    if (card.savedOptions && Array.isArray(card.savedOptions) && card.savedOptions.length > 0) {
      return true;
    }
    
    // Case 3: Card has questionType explicitly set
    if (card.questionType === 'multiple_choice') {
      return true;
    }
    
    // Case 4: Answer contains "Correct Answer: X)" pattern
    if (card.answer && typeof card.answer === 'string') {
      // Check for "Correct Answer: a)" or "Correct Answer: b)" pattern
      if (card.answer.match(/Correct Answer:\s*[a-z]\)/i)) {
        return true;
      }
      
      // Check for option lettering pattern
      if (card.answer.match(/[a-e]\)\s*[A-Za-z]/)) {
        return true;
      }
    }
    
    // Case 5: Legacy support - card has type set to multiple_choice
    if (card.type === 'multiple_choice') {
      return true;
    }
    
    return false;
  }
  
  // Helper function to extract options from answer text
  function extractOptionsFromAnswer(card) {
    if (!card.answer || typeof card.answer !== 'string') {
      return [];
    }
    
    // Try to find the correct option letter (a, b, c, d, e)
    const correctAnswerMatch = card.answer.match(/Correct Answer:\s*([a-e])\)/i);
    if (!correctAnswerMatch) {
      return [];
    }
    
    const correctLetter = correctAnswerMatch[1].toLowerCase();
    
    // Create placeholder options based on the correct answer position
    const options = [];
    const letters = ['a', 'b', 'c', 'd', 'e'];
    const correctIndex = letters.indexOf(correctLetter);
    
    if (correctIndex >= 0) {
      // Create 4 options with the correct one marked
      letters.slice(0, 4).forEach(letter => {
        options.push({
          text: letter === correctLetter ? `${card.detailedAnswer || 'Correct option'}` : `Option ${letter.toUpperCase()}`,
          isCorrect: letter === correctLetter
        });
      });
    }
    
    return options;
  }
  
  // Save flashcard user data
  // Handle data saving with field preservation (specifically for topic list updates)
  function handlePreserveFieldsDataSave(userId, data, callback) {
    console.log(`Flashcard app [${new Date().toISOString()}]: Saving with field preservation for user:`, userId);
    
    // Ensure we have a record ID
    const recordId = data.recordId;
    if (!recordId) {
      console.error("Flashcard app: Cannot save with field preservation - no record ID");
      callback(false);
      return;
    }
    
    // First, get the current data to perform a proper merge
    getUserDataById(recordId, function(existingData) {
      if (!existingData) {
        console.error(`Flashcard app [${new Date().toISOString()}]: Error getting user data for merging`);
        callback(false);
        return;
      }
      
      // Extract existing topic lists if any
      let existingTopicLists = [];
      if (existingData[FIELD_MAPPING.topicLists]) {
        try {
          let topicListsData = existingData[FIELD_MAPPING.topicLists];
          if (typeof topicListsData === 'string' && topicListsData.includes('%')) {
            topicListsData = safeDecodeURIComponent(topicListsData);
          }
          existingTopicLists = safeParseJSON(topicListsData) || [];
          console.log(`Flashcard app [${new Date().toISOString()}]: Found ${existingTopicLists.length} existing topic lists for merging`);
        } catch (e) {
          console.error(`Flashcard app [${new Date().toISOString()}]: Error parsing existing topic lists:`, e);
          existingTopicLists = [];
        }
      }
      
      // Extract existing topic metadata if any
      let existingMetadata = [];
      if (existingData[FIELD_MAPPING.topicMetadata]) {
        try {
          let metadataData = existingData[FIELD_MAPPING.topicMetadata];
          if (typeof metadataData === 'string' && metadataData.includes('%')) {
            metadataData = safeDecodeURIComponent(metadataData);
          }
          existingMetadata = safeParseJSON(metadataData) || [];
          console.log(`Flashcard app [${new Date().toISOString()}]: Found ${existingMetadata.length} existing topic metadata items for merging`);
        } catch (e) {
          console.error(`Flashcard app [${new Date().toISOString()}]: Error parsing existing topic metadata:`, e);
          existingMetadata = [];
        }
      }
      
      // Get cleaned versions of the new topic data
      const newTopicLists = ensureDataIsSerializable(data.topicLists || []);
      const newTopicMetadata = ensureDataIsSerializable(data.topicMetadata || []);
      
      // Create maps for existing topic lists by subject
      const existingSubjectMap = new Map();
      existingTopicLists.forEach(list => {
        if (list.subject) {
          existingSubjectMap.set(list.subject, list);
        }
      });
      
      // Create maps for existing metadata by ID
      const existingMetadataMap = new Map();
      existingMetadata.forEach(item => {
        if (item.topicId) {
          existingMetadataMap.set(item.topicId, item);
        } else if (item.subject) {
          existingMetadataMap.set(`subject_${item.subject}`, item);
        }
      });
      
      // Merge the topic lists - add new ones and update existing ones
      let mergedTopicLists = [...existingTopicLists]; // Start with existing lists
      
      // Process new topic lists
      newTopicLists.forEach(newList => {
        if (!newList.subject) return; // Skip invalid lists
        
        const existingIndex = mergedTopicLists.findIndex(list => list.subject === newList.subject);
        
        if (existingIndex >= 0) {
          // Update existing list
          mergedTopicLists[existingIndex] = { ...newList };
          console.log(`Flashcard app [${new Date().toISOString()}]: Updated topic list for subject: ${newList.subject}`);
        } else {
          // Add new list
          mergedTopicLists.push({ ...newList });
          console.log(`Flashcard app [${new Date().toISOString()}]: Added new topic list for subject: ${newList.subject}`);
        }
      });
      
      // Merge metadata - add new ones and update existing ones
      let mergedMetadata = [...existingMetadata]; // Start with existing metadata
      
      // Process new metadata
      newTopicMetadata.forEach(newItem => {
        let key = newItem.topicId || (newItem.subject ? `subject_${newItem.subject}` : null);
        if (!key) return; // Skip invalid items
        
        const existingIndex = mergedMetadata.findIndex(item => 
          (item.topicId && item.topicId === newItem.topicId) || 
          (item.subject && item.subject === newItem.subject && !item.topicId)
        );
        
        if (existingIndex >= 0) {
          // Update existing item
          mergedMetadata[existingIndex] = { ...newItem };
        } else {
          // Add new item
          mergedMetadata.push({ ...newItem });
        }
      });
      
      // Create an update object that contains merged data
      const updateData = {
        // Update the following fields
        [FIELD_MAPPING.topicLists]: JSON.stringify(mergedTopicLists),
        [FIELD_MAPPING.topicMetadata]: JSON.stringify(mergedMetadata),
        [FIELD_MAPPING.lastSaved]: new Date().toISOString()
      };
      
      // Log what we're updating
      debugLog("UPDATING WITH MERGED DATA", {
        originalTopicListsCount: existingTopicLists.length,
        newTopicListsCount: newTopicLists.length,
        mergedTopicListsCount: mergedTopicLists.length,
        originalMetadataCount: existingMetadata.length,
        newMetadataCount: newTopicMetadata.length,
        mergedMetadataCount: mergedMetadata.length,
        recordId: recordId,
        timestamp: new Date().toISOString()
      });
      
      
     // Define the API call as a function returning a promise
      const savePreservedFieldsApiCall = () => {
          return new Promise((resolve, reject) => {
              $.ajax({
                  url: KNACK_API_URL + '/objects/' + FLASHCARD_OBJECT + '/records/' + recordId,
                  type: 'PUT',
                  headers: {
                      'X-Knack-Application-Id': knackAppId,
                      'X-Knack-REST-API-Key': knackApiKey,
                      'Authorization': Knack.getUserToken(),
                      'Content-Type': 'application/json'
                  },
                  data: JSON.stringify(updateData),
                  success: function(response) {
                      resolve(response); // Resolve the promise on success
                  },
                  error: function(error) {
                      reject(error); // Reject the promise on error
                  }
              });
          });
      };
  
      // Use the generic retry mechanism
      retryApiCall(savePreservedFieldsApiCall)
        .then((response) => {
            console.log(`Flashcard app [${new Date().toISOString()}]: Successfully saved topic list data:`, response.id);
            debugLog("SAVE SUCCESS", {
                recordId: response.id,
                timestamp: new Date().toISOString()
            });
  
            // IMPORTANT: Create topic shells immediately when topic lists are saved
            if (mergedTopicLists && mergedTopicLists.length > 0) {
                console.log(`Flashcard app [${new Date().toISOString()}]: Creating topic shells for ${mergedTopicLists.length} topic lists`);
                createTopicShellsFromLists(mergedTopicLists, recordId);
            } else {
                console.log(`Flashcard app [${new Date().toISOString()}]: No topic lists to create shells from`);
            }
  
            callback(true); // Call original callback on success
        })
        .catch((error) => {
            console.error(`Flashcard app [${new Date().toISOString()}]: Error saving topic list data after retries:`, error);
            debugLog("SAVE ERROR", {
                recordId: recordId,
                errorStatus: error?.status,
                errorText: error?.statusText || error?.message || 'Unknown error'
            });
            callback(false); // Call original callback on failure
        });
      });
  }
  
  /**
   * Create topic shells from topic lists and save them to the card bank
   * @param {Array} topicLists - Array of topic lists
   * @param {string} recordId - Record ID
   */
  function createTopicShellsFromLists(topicLists, recordId) {
    try {
      if (!Array.isArray(topicLists) || topicLists.length === 0) {
        console.log(`Flashcard app [${new Date().toISOString()}]: No topic lists to create shells from`);
        return;
      }
      
      // Directly use the API implementation since persistence services are no longer assumed
      console.log(`Flashcard app [${new Date().toISOString()}]: Using direct API approach for creating topic shells`);
      createTopicShellsDirectAPI(topicLists, recordId);
  
    } catch (error) {
      console.error(`Flashcard app [${new Date().toISOString()}]: Error in createTopicShellsFromLists:`, error);
      // Attempt direct API call even on error in the wrapper function
      createTopicShellsDirectAPI(topicLists, recordId);
    }
  }
  
  // Direct API implementation instead of legacy fallback
  function createTopicShellsDirectAPI(topicLists, recordId) {
    try {
      if (!Array.isArray(topicLists) || topicLists.length === 0) {
        console.log(`Flashcard app [${new Date().toISOString()}]: No topic lists to create shells from`);
        return;
      }
      
      console.log(`Flashcard app [${new Date().toISOString()}]: Creating topic shells from ${topicLists.length} topic lists using direct API`);
      
      // Process all topic lists to extract topics
      const topicShells = [];
      
      // Create a map to track shells by ID to prevent duplication within a single save operation
      const idMap = new Map();
      
      // Track the unique topics we're processing
      const uniqueSubjects = new Set();
      
      // First fetch current color mapping and existing topic shells if any
      getUserDataById(recordId, function(userData) {
        if (!userData) {
          console.error(`Flashcard app [${new Date().toISOString()}]: User data not found for record ID: ${recordId}`);
          return;
        }
        
        // Extract existing subject colors from field_3000
        let subjectColors = {};
        if (userData[FIELD_MAPPING.colorMapping]) {
          try {
            let colorData = userData[FIELD_MAPPING.colorMapping];
            if (typeof colorData === 'string' && colorData.includes('%')) {
              colorData = safeDecodeURIComponent(colorData);
            }
            subjectColors = safeParseJSON(colorData) || {};
          } catch (e) {
            console.error(`Flashcard app [${new Date().toISOString()}]: Error parsing subject colors:`, e);
            subjectColors = {};
          }
        }
        
        // Extract existing topic metadata (if any)
        let topicMetadata = [];
        if (userData[FIELD_MAPPING.topicMetadata]) {
          try {
            let metadataStr = userData[FIELD_MAPPING.topicMetadata];
            if (typeof metadataStr === 'string' && metadataStr.includes('%')) {
              metadataStr = safeDecodeURIComponent(metadataStr);
            }
            topicMetadata = safeParseJSON(metadataStr) || [];
          } catch (e) {
            console.error(`Flashcard app [${new Date().toISOString()}]: Error parsing topic metadata:`, e);
            topicMetadata = [];
          }
        }
        
        // Generate a list of unique subjects from the topic lists
        topicLists.forEach(list => {
          const subject = list.subject || "General";
          uniqueSubjects.add(subject);
        });
        
        // Base colors for subjects if no existing color mapping
        const baseColors = [
          '#3cb44b', // Green
          '#4363d8', // Blue
          '#e6194B', // Red
          '#911eb4', // Purple
          '#f58231', // Orange
          '#42d4f4', // Cyan
          '#f032e6', // Magenta
          '#469990', // Teal
          '#9A6324', // Brown
          '#800000', // Maroon
          '#808000', // Olive
          '#000075', // Navy
          '#e6beff', // Lavender
          '#aaffc3', // Mint
          '#ffd8b1', // Apricot
          '#808080'  // Grey
        ];
        
        // Assign subject colors if not already defined
        let colorIndex = 0;
        uniqueSubjects.forEach(subject => {
          if (!subjectColors[subject]) {
            subjectColors[subject] = baseColors[colorIndex % baseColors.length];
            colorIndex++;
          }
        });
        
        // Function to generate color variations for topics within a subject
        function generateShadeVariations(baseColor, count) {
          const shades = [];
          
          // Convert hex to HSL for easier manipulation
          const hexToHSL = (hex) => {
            // Remove the # if present
            hex = hex.replace('#', '');
            
            // Convert to RGB first
            const r = parseInt(hex.substring(0, 2), 16) / 255;
            const g = parseInt(hex.substring(2, 4), 16) / 255;
            const b = parseInt(hex.substring(4, 6), 16) / 255;
            
            // Find max and min values
            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            
            // Calculate HSL
            let h, s, l = (max + min) / 2;
            
            if (max === min) {
              h = s = 0; // achromatic
            } else {
              const d = max - min;
              s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
              
              switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
              }
              
              h /= 6;
            }
            
            return { h, s, l };
          };
          
          // Convert HSL back to hex
          const hslToHex = (h, s, l) => {
            let r, g, b;
            
            if (s === 0) {
              r = g = b = l; // achromatic
            } else {
              const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1/6) return p + (q - p) * 6 * t;
                if (t < 1/2) return q;
                if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                return p;
              };
              
              const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
              const p = 2 * l - q;
              
              r = hue2rgb(p, q, h + 1/3);
              g = hue2rgb(p, q, h);
              b = hue2rgb(p, q, h - 1/3);
            }
            
            // Convert to hex
            const toHex = (x) => {
              const hex = Math.round(x * 255).toString(16);
              return hex.length === 1 ? '0' + hex : hex;
            };
            
            return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
          };
          
          // Get the HSL values
          const { h, s, l } = hexToHSL(baseColor);
          
          // Generate variations
          for (let i = 0; i < count; i++) {
            // Create variations with slight changes to hue and lightness
            // Keep within the same color family
            const newH = (h + (i * 0.05)) % 1; // Small hue adjustments
            const newL = Math.max(0.3, Math.min(0.7, l + (i - Math.floor(count/2)) * 0.05)); // Vary lightness
            shades.push(hslToHex(newH, s, newL));
          }
          
          return shades;
        }
        
        // IMPORTANT: Create a new array for storing subject metadata updates
        const subjectMetadata = [];
        
        // Process each topic list
        topicLists.forEach(list => {
          if (!list.topics || !Array.isArray(list.topics)) {
            console.log(`Flashcard app [${new Date().toISOString()}]: Invalid topic list format, skipping`);
            return;
          }
          
          const subject = list.subject || "General";
          const examBoard = list.examBoard || "General";
          const examType = list.examType || "Course";
          
          // Store subject metadata for later use
          const existingSubjectMetadata = subjectMetadata.find(m => m.subject === subject);
          if (!existingSubjectMetadata) {
            subjectMetadata.push({
              subject: subject,
              examBoard: examBoard,
              examType: examType,
              updated: new Date().toISOString()
            });
          }
          
          // Get the subject color
          const subjectColor = subjectColors[subject] || '#3cb44b'; // Default to green if not found
          
          // Generate topic colors for this subject
          const topicColors = generateShadeVariations(subjectColor, list.topics.length);
          
          // Get current date string for consistent creation timestamp
          const now = new Date().toISOString();
          
          // Process each topic in the list
          list.topics.forEach((topic, index) => {
            // Skip if topic is invalid
            if (!topic || (!topic.id && !topic.name && !topic.topic)) {
              console.log(`Flashcard app [${new Date().toISOString()}]: Skipping invalid topic:`, topic);
              return;
            }
            
            // Create a unique ID for the topic shell
            const topicId = topic.id || `topic_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
            
            // Get the topic name - try various properties that might contain it
            const topicName = topic.name || topic.topic || 
              (topic.mainTopic && topic.subtopic ? `${topic.mainTopic}: ${topic.subtopic}` : "Unknown Topic");
            
            // Skip if we've already created a shell with this ID (prevents duplication within this operation)
            if (idMap.has(topicId)) {
              return;
            }
            
            // Get the topic color - use the generated variations
            const topicColor = topicColors[index % topicColors.length];
            
            // Create a topic shell with proper metadata
            const topicShell = {
              id: topicId,
              type: 'topic',
              name: topicName,
              topic: topicName, // Include both name AND topic properties for consistency
              subject: subject,
              examBoard: examBoard,
              examType: examType,
              color: topicColor, // Use the generated topic color
              baseColor: subjectColor, // Store the subject color as the base
              subjectColor: subjectColor, // Explicitly include subject color for reference
              cards: [], // Empty cards array - this is an empty topic shell
              isShell: true,
              isEmpty: true, // Mark as empty
              created: now, // Use the same timestamp for all shells from this operation
              updated: now,
              metadata: {
                examBoard: examBoard,
                examType: examType,
                subject: subject,
                lastUpdated: now
              }
            };
            
            // Store metadata separately for topic
            topicMetadata.push({
              topicId: topicId,
              name: topicName,
              subject: subject,
              examBoard: examBoard,
              examType: examType,
              updated: now
            });
            
            // Track this ID
            idMap.set(topicId, true);
            
            topicShells.push(topicShell);
          });
        });
        
        if (topicShells.length === 0) {
          console.log(`Flashcard app [${new Date().toISOString()}]: No topic shells created from lists`);
          return;
        }
        
        console.log(`Flashcard app [${new Date().toISOString()}]: Created ${topicShells.length} topic shells with consistent colors and metadata`);
        
        // Get the existing card bank data
        let existingItems = [];
        if (userData[FIELD_MAPPING.cardBankData]) {
          let cardData = userData[FIELD_MAPPING.cardBankData];
          if (typeof cardData === 'string' && cardData.includes('%')) {
            cardData = safeDecodeURIComponent(cardData);
          }
          existingItems = safeParseJSON(cardData) || [];
        }
        
        // Get the sync service for type handling
        const syncService = getSyncService();
        
        // Split by type to preserve any existing topic shells
        const { topics: existingTopicShells, cards: existingCards } = syncService.splitByType(existingItems);
        
        // Create a map of existing topic shells by ID for lookup
        const existingTopicMap = new Map();
        existingTopicShells.forEach(shell => {
          existingTopicMap.set(shell.id, shell);
        });
        
        // IMPORTANT: Create a function to merge an existing shell with a new one
        // This preserves important data like cards array while updating metadata
        const mergeShells = (existing, newShell) => {
          return {
            ...newShell,
            cards: existing.cards || [],     // Preserve existing cards
            isEmpty: (existing.cards || []).length === 0,  // Update isEmpty flag based on cards
            created: existing.created || newShell.created, // Preserve original creation date
            updated: new Date().toISOString() // Always update timestamp
          };
        };
        
        // Add or update topic shells, avoiding complete duplicates
        // Process new shells with exactly matching IDs first to avoid duplication
        const deduplicatedShells = [];
        const processedIds = new Set();
        
        // First pass: Process any shells that have existing IDs
        topicShells.forEach(newShell => {
          if (existingTopicMap.has(newShell.id)) {
            // Merge with existing shell to preserve data
            const mergedShell = mergeShells(existingTopicMap.get(newShell.id), newShell);
            deduplicatedShells.push(mergedShell);
            processedIds.add(newShell.id);
            // Remove from map to indicate it's been processed
            existingTopicMap.delete(newShell.id);
          }
        });
        
        // Second pass: Add any new shells that don't have matching IDs
        topicShells.forEach(newShell => {
          if (!processedIds.has(newShell.id)) {
            deduplicatedShells.push(newShell);
            processedIds.add(newShell.id);
          }
        });
        
        // Add any remaining existing shells that weren't matched to new ones
        existingTopicMap.forEach(remainingShell => {
          if (!processedIds.has(remainingShell.id)) {
            deduplicatedShells.push(remainingShell);
            processedIds.add(remainingShell.id);
          }
        });
        
        console.log(`Flashcard app [${new Date().toISOString()}]: Deduplication complete: ${topicShells.length} new + ${existingTopicShells.length} existing = ${deduplicatedShells.length} final shells`);
        
        // Combine everything
        const finalBankData = [...deduplicatedShells, ...existingCards];
        
        // Update the record with a retry mechanism for more reliability
        let saveRetryCount = 0;
        const maxSaveRetries = 2;
        
        function attemptShellSave() {
          $.ajax({
            url: KNACK_API_URL + '/objects/' + FLASHCARD_OBJECT + '/records/' + recordId,
            type: 'PUT',
            headers: {
              'X-Knack-Application-Id': knackAppId,
              'X-Knack-REST-API-Key': knackApiKey,
              'Authorization': Knack.getUserToken(),
              'Content-Type': 'application/json'
            },
            data: JSON.stringify({
              [FIELD_MAPPING.cardBankData]: JSON.stringify(finalBankData),
              [FIELD_MAPPING.colorMapping]: JSON.stringify(subjectColors), // Save updated subject colors
              [FIELD_MAPPING.topicMetadata]: JSON.stringify(topicMetadata), // IMPORTANT: Save topic metadata 
              [FIELD_MAPPING.lastSaved]: new Date().toISOString()
            }),
            success: function(response) {
              console.log(`Flashcard app [${new Date().toISOString()}]: Successfully added ${deduplicatedShells.length} topic shells (after deduplication)`);
              
              // Notify the React app that card bank data has been updated with a more specific message
              if (window.postMessage && document.getElementById('flashcard-app-iframe')) {
                const iframe = document.getElementById('flashcard-app-iframe');
                if (iframe && iframe.contentWindow) {
                  iframe.contentWindow.postMessage({
                    type: 'TOPIC_SHELLS_CREATED',
                    timestamp: new Date().toISOString(),
                    count: deduplicatedShells.length,
                    shouldReload: true // Signal that a reload is needed
                  }, '*');
                }
              }
            },
            error: function(error) {
              console.error(`Flashcard app [${new Date().toISOString()}]: Error adding topic shells:`, error);
              
              // Retry logic for failed saves
              if (saveRetryCount < maxSaveRetries) {
                console.log(`Flashcard app [${new Date().toISOString()}]: Retrying topic shell save (${saveRetryCount + 1}/${maxSaveRetries})...`);
                saveRetryCount++;
                // Wait before retrying
                setTimeout(attemptShellSave, 1000);
              }
            }
          });
        }
        
        // Start the save process
        attemptShellSave();
      });
    } catch (error) {
      console.error(`Flashcard app [${new Date().toISOString()}]: Error in direct API topic shell creation:`, error);
    }
  }
  
  // Helper function to get user data by ID
  function getUserDataById(recordId, callback) {
    $.ajax({
      url: KNACK_API_URL + '/objects/' + FLASHCARD_OBJECT + '/records/' + recordId,
      type: 'GET',
      headers: {
        'X-Knack-Application-Id': knackAppId,
        'X-Knack-REST-API-Key': knackApiKey,
        'Authorization': Knack.getUserToken(),
        'Content-Type': 'application/json'
      },
      success: function(userData) {
        callback(userData);
      },
      error: function(error) {
        console.error(`Flashcard app [${new Date().toISOString()}]: Error getting user data:`, error);
        callback(null);
      }
    });
  }
  
  // Migration helper to standardize on questionType
  function migrateTypeToQuestionType(data) {
    if (!data) return data;
    
    // Handle arrays
    if (Array.isArray(data)) {
      return data.map(item => migrateTypeToQuestionType(item));
    }
    
    // Handle objects
    if (typeof data === 'object') {
      // Create a new object to avoid modifying original
      const newData = {...data};
      
      // Fix question type fields
      if (newData.type === 'multiple_choice' || newData.type === 'short_answer') {
        // Set questionType based on legacy type
        newData.questionType = newData.type;
        
        // Remove the legacy type field for question format
        delete newData.type;
        
        console.log(`Migrated type to questionType for item: ${newData.id || 'unknown'}`);
      }
      
      // Recursively process nested objects
      for (const key in newData) {
        if (newData[key] && typeof newData[key] === 'object') {
          newData[key] = migrateTypeToQuestionType(newData[key]);
        }
      }
      
      return newData;
    }
    
    // For non-objects, just return as is
    return data;
  }
  
  // Save flashcard user data
  function saveFlashcardUserData(recordId, data, preserveFields, callback) {
    console.log("Flashcard app: Saving user data to Knack:", recordId);
    debugLog("DATA TO SAVE", data);
  
    if (!recordId) {
      console.error("Flashcard app: No record ID provided for saving.");
      if (callback) callback(false, { message: "No record ID" });
      return;
    }
  
    let payload = {};
    payload[FIELD_MAPPING.lastSaved] = new Date().toISOString(); // Update last saved time
  
    try {
      // --- Prepare Card Bank Data (field_2979) ---
      if (data.cards) {
        // Perform migration and standardization before saving
        let cardsToSave = migrateTypeToQuestionType(data.cards);
        cardsToSave = standardizeCards(cardsToSave);
        payload[FIELD_MAPPING.cardBankData] = safeEncodeURIComponent(JSON.stringify(cardsToSave || []));
        console.log(`Flashcard app: Preparing ${cardsToSave.length} cards for ${FIELD_MAPPING.cardBankData}`);
      }
  
      // --- Prepare Spaced Repetition Data (field_2986 - field_2990) ---
      if (data.spacedRepetition) {
        Object.keys(data.spacedRepetition).forEach((boxKey, index) => {
          const boxNum = index + 1;
          const fieldKey = FIELD_MAPPING[`box${boxNum}Data`];
          if (fieldKey && data.spacedRepetition[boxKey]) {
            payload[fieldKey] = safeEncodeURIComponent(JSON.stringify(data.spacedRepetition[boxKey] || []));
            console.log(`Flashcard app: Preparing ${data.spacedRepetition[boxKey].length} items for Box ${boxNum} (${fieldKey})`);
          }
        });
      }
  
      // --- Prepare Topic Lists Data (field_3011) ---
      if (data.topicLists) {
        payload[FIELD_MAPPING.topicLists] = safeEncodeURIComponent(JSON.stringify(data.topicLists || []));
        console.log(`Flashcard app: Preparing ${data.topicLists.length} topic lists for ${FIELD_MAPPING.topicLists}`);
      }
  
      // --- Prepare Color Mapping Data (field_3000) ---
      if (data.colorMapping) {
        payload[FIELD_MAPPING.colorMapping] = safeEncodeURIComponent(JSON.stringify(data.colorMapping || {}));
        console.log(`Flashcard app: Preparing color mapping for ${FIELD_MAPPING.colorMapping}`);
      }
  
      // If preserveFields is specified, we might need to adjust the logic.
      // Currently, this replaces all fields. If we need selective updates,
      // this would need modification. For now, assume full replacement is okay.
      if (preserveFields && preserveFields.length > 0) {
          console.warn("Flashcard app: 'preserveFields' logic is not fully implemented in multi-field save. Saving all sections.");
          // Future enhancement: check preserveFields array and only include
          // payload[fieldKey] if the corresponding section is NOT in preserveFields.
      }
  
  
    } catch (e) {
      console.error("Flashcard app: Error preparing payload for saving:", e);
      if (callback) callback(false, { message: "Error preparing data", error: e });
      return;
    }
  
    debugLog("FINAL PAYLOAD", payload);
  
    // Define the API call as a promise
    const saveApiCall = () => {
      return new Promise((resolve, reject) => {
        $.ajax({
          url: `${KNACK_API_URL}/objects/${FLASHCARD_OBJECT}/records/${recordId}`,
          type: 'PUT',
          headers: {
            'X-Knack-Application-Id': knackAppId,
            'X-Knack-REST-API-Key': knackApiKey,
            'Authorization': Knack.getUserToken(),
            'Content-Type': 'application/json'
          },
          data: JSON.stringify(payload),
          success: function(response) {
            resolve(response);
          },
          error: function(error) {
            reject(error);
          }
        });
      });
    };
  
    // Use retry mechanism for the API call
    retryApiCall(saveApiCall)
      .then((response) => {
        console.log("Flashcard app: Save successful:", response);
        if (callback) callback(true, response);
      })
      .catch((error) => {
        console.error("Flashcard app: Error saving user data after retries:", error);
        if (callback) callback(false, { message: "API save failed", error: error });
      });
  }
  
  
  
  
  /**
   * Handle adding cards to the bank and Box 1 for spaced repetition
   * @param {Object} data - The data received from the React app
   * @param {Function} callback - Callback function with success/failure status
   */
  function handleAddToBank(data, callback) {
    try {
      // Extract the necessary info from the data
      const user = window.currentKnackUser || {};
      const userId = user.id;
      const recordId = data.recordId;
      const newCards = data.cards || [];
      
      // Debug log the operation
      console.log(`Flashcard app [${new Date().toISOString()}]: Starting handleAddToBank with ${newCards.length} cards`);
      
      // Prevent processing if another save is already in progress
      if (saveInProgress) {
        console.log(`Flashcard app [${new Date().toISOString()}]: Another save operation is already in progress, queuing this operation`);
        saveQueued = true;
        
        // Send feedback to callback so UI can show appropriate message
        if (typeof callback === 'function') {
          callback({
            success: false,
            queued: true,
            message: "Operation queued - already saving"
          });
        }
        return;
      }
      
      // Mark save as in progress
      saveInProgress = true;
      
      // Directly use the API implementation since persistence services are no longer passed
      console.log("Flashcard app: Using direct API for adding cards to bank");
      addToBankDirectAPI(data, callback);
  
    } catch (error) {
      console.error("Flashcard app: Error in handleAddToBank:", error);
      
      // Reset the save in progress flag
      saveInProgress = false;
      
      if (typeof callback === 'function') {
        callback({
          success: false,
          error: error,
          message: "Unexpected error in add to bank function"
        });
      }
    }
  }
  
  // Direct API implementation for adding cards to bank
  function addToBankDirectAPI(data, callback) {
    try {
      // Extract the necessary info from the data
      const user = window.currentKnackUser || {};
      const userId = user.id;
      const recordId = data.recordId;
      const newCards = data.cards || [];
      
      // Debug log the operation
      console.log(`Flashcard app [${new Date().toISOString()}]: Starting direct API add to bank with ${newCards.length} cards`);
      
      // Ensure we have a record ID
      if (!recordId) {
        // No record ID, try to load the user data first
        loadFlashcardUserData(userId, function(userData) {
          if (userData && userData.recordId) {
            // Now we have a record ID, retry adding to bank
            saveInProgress = false; // Reset flag before retry
            data.recordId = userData.recordId;
            addToBankDirectAPI(data, callback);
          } else {
            console.error("Flashcard app: Cannot add to bank - no record ID found");
            saveInProgress = false;
            if (typeof callback === 'function') {
              callback({ success: false, message: "No record ID found" });
            }
          }
        });
        return;
      }
      
      // Standardize the new cards
      const standardizedCards = standardizeCards(newCards);
      
      // First, get the current data to update it properly
      $.ajax({
        url: KNACK_API_URL + '/objects/' + FLASHCARD_OBJECT + '/records/' + recordId,
        type: 'GET',
        headers: {
          'X-Knack-Application-Id': knackAppId,
          'X-Knack-REST-API-Key': knackApiKey,
          'Authorization': Knack.getUserToken(),
          'Content-Type': 'application/json'
        },
        success: function(existingData) {
          try {
            // Parse existing card bank data
            let existingItems = [];
            if (existingData[FIELD_MAPPING.cardBankData]) {
              let cardData = existingData[FIELD_MAPPING.cardBankData];
              if (typeof cardData === 'string' && cardData.includes('%')) {
                cardData = safeDecodeURIComponent(cardData);
              }
              existingItems = safeParseJSON(cardData) || [];
            }
            
            // Log existing items to diagnose potential issues
            console.log(`Flashcard app [${new Date().toISOString()}]: Processing ${existingItems.length} existing items`);
            
            // Migrate any legacy type fields to questionType
            existingItems = migrateTypeToQuestionType(existingItems);
            
            // Get the sync service for type handling
            const syncService = getSyncService();
            
            // Split by type to preserve topic shells
            const { topics: topicShells, cards: existingCards } = syncService.splitByType(existingItems);
            
            console.log(`Flashcard app [${new Date().toISOString()}]: Found ${topicShells.length} topic shells and ${existingCards.length} existing cards before adding ${standardizedCards.length} new cards`);
            
            // Create maps for existing cards and topic shells
            const existingCardMap = new Map();
            existingCards.forEach(card => {
              if (card.id) {
                existingCardMap.set(card.id, card);
              }
            });
            
            const existingTopicMap = new Map();
            topicShells.forEach(shell => {
              if (shell.id) {
                existingTopicMap.set(shell.id, shell);
              }
            });
            
            // Process the new cards to match with topic shells and deduplicate
            const processedNewCards = [];
            const cardIdMap = new Map();
            
            standardizedCards.forEach(card => {
              // Skip if already processed this card ID
              if (card.id && cardIdMap.has(card.id)) {
                console.log(`Flashcard app [${new Date().toISOString()}]: Skipping already processed card with ID ${card.id}`);
                return;
              }
              
              // Skip if card already exists in database (prevent duplication)
              if (card.id && existingCardMap.has(card.id)) {
                console.log(`Flashcard app [${new Date().toISOString()}]: Skipping duplicate card with ID ${card.id}`);
                return;
              }
              
              // Store in our processed map
              if (card.id) {
                cardIdMap.set(card.id, true);
              }
              
              // Try to find a topic shell that matches this card's topic
              if (card.topic && card.subject) {
                // First try by topicId if available
                if (card.topicId && existingTopicMap.has(card.topicId)) {
                  const matchingShellById = existingTopicMap.get(card.topicId);
                  
                  // Add the card with the topicId already set
                  processedNewCards.push(card);
                  
                  // Update the topic shell's isEmpty flag
                  if (matchingShellById.isEmpty === true) {
                    const shellIndex = topicShells.findIndex(s => s.id === matchingShellById.id);
                    if (shellIndex >= 0) {
                      topicShells[shellIndex].isEmpty = false;
                      topicShells[shellIndex].updated = new Date().toISOString();
                      console.log(`Flashcard app [${new Date().toISOString()}]: Updated topic shell ${matchingShellById.id} isEmpty flag to false`);
                    }
                  }
                  
                  return;
                }
                
                // If no topicId match, look by subject+topic name
                const matchingShell = topicShells.find(shell => 
                  (shell.name === card.topic || shell.topic === card.topic) && 
                  shell.subject === card.subject
                );
                
                if (matchingShell) {
                  // Found a matching topic shell, associate this card with it
                  processedNewCards.push({
                    ...card,
                    topicId: matchingShell.id // Connect to topic shell by ID
                  });
                  
                  // Update the topic shell's isEmpty flag
                  if (matchingShell.isEmpty === true) {
                    const shellIndex = topicShells.findIndex(s => s.id === matchingShell.id);
                    if (shellIndex >= 0) {
                      topicShells[shellIndex].isEmpty = false;
                      topicShells[shellIndex].updated = new Date().toISOString();
                      console.log(`Flashcard app [${new Date().toISOString()}]: Updated topic shell ${matchingShell.id} isEmpty flag to false`);
                    }
                  }
                  
                  return;
                }
              }
              
              // If no matching shell found, add the card as is
              processedNewCards.push(card);
            });
            
            console.log(`Flashcard app [${new Date().toISOString()}]: Processed ${processedNewCards.length} new cards after deduplication`);
            
            // Combine everything - make sure to use the possibly updated topic shells
            const finalBankData = [...topicShells, ...existingCards, ...processedNewCards];
            
            // Parse existing Box 1 data to add the new cards there as well
            let box1Data = [];
            if (existingData[FIELD_MAPPING.box1Data]) {
              let box1String = existingData[FIELD_MAPPING.box1Data];
              if (typeof box1String === 'string' && box1String.includes('%')) {
                box1String = safeDecodeURIComponent(box1String);
              }
              box1Data = safeParseJSON(box1String) || [];
            }
            
            // Create Box 1 entries for the new cards, avoiding duplicates
            const now = new Date().toISOString();
            const existingBox1Map = new Map();
            box1Data.forEach(entry => {
              if (entry.cardId) {
                existingBox1Map.set(entry.cardId, true);
              }
            });
            
            const newBox1Entries = processedNewCards
              .filter(card => card.id && !existingBox1Map.has(card.id)) // Skip if already in Box 1
              .map(card => ({
                cardId: card.id,
                lastReviewed: now,
                nextReviewDate: now // Will be updated by the app with proper spacing
              }));
            
            console.log(`Flashcard app [${new Date().toISOString()}]: Adding ${newBox1Entries.length} new Box 1 entries`);
            
            // Combine existing and new Box 1 entries
            const updatedBox1 = [...box1Data, ...newBox1Entries];
            
            // CRITICAL: Make sure we get the existing topic lists to preserve them
            let topicLists = [];
            if (existingData[FIELD_MAPPING.topicLists]) {
              let topicListsString = existingData[FIELD_MAPPING.topicLists];
              if (typeof topicListsString === 'string' && topicListsString.includes('%')) {
                topicListsString = safeDecodeURIComponent(topicListsString);
              }
              topicLists = safeParseJSON(topicListsString) || [];
            }
            
            // Check for any review data that needs to be preserved
            let reviewData = [];
            if (existingData[FIELD_MAPPING.reviewData]) {
              let reviewDataString = existingData[FIELD_MAPPING.reviewData];
              if (typeof reviewDataString === 'string' && reviewDataString.includes('%')) {
                reviewDataString = safeDecodeURIComponent(reviewDataString);
              }
              reviewData = safeParseJSON(reviewDataString) || [];
            }
            
            // Prepare the update data with all preserved fields
            const updateData = {
              [FIELD_MAPPING.cardBankData]: JSON.stringify(finalBankData),
              [FIELD_MAPPING.box1Data]: JSON.stringify(updatedBox1), 
              [FIELD_MAPPING.lastSaved]: new Date().toISOString(),
              // Preserve important fields
              [FIELD_MAPPING.topicLists]: JSON.stringify(topicLists)
            };
            
            // Include review data if it exists
            if (reviewData.length > 0) {
              updateData[FIELD_MAPPING.reviewData] = JSON.stringify(reviewData);
            }
            
            // Update the record
            console.log(`Flashcard app [${new Date().toISOString()}]: Sending update with ${finalBankData.length} total items`);
            
            $.ajax({
              url: KNACK_API_URL + '/objects/' + FLASHCARD_OBJECT + '/records/' + recordId,
              type: 'PUT',
              headers: {
                'X-Knack-Application-Id': knackAppId,
                'X-Knack-REST-API-Key': knackApiKey,
                'Authorization': Knack.getUserToken(),
                'Content-Type': 'application/json'
              },
              data: JSON.stringify(updateData),
              success: function(response) {
                console.log(`Flashcard app [${new Date().toISOString()}]: Successfully added ${processedNewCards.length} cards to bank`);
                
                // Reset the save in progress flag
                saveInProgress = false;
                
                // Check if we need to process queued operations
                if (saveQueued) {
                  saveQueued = false;
                  console.log(`Flashcard app [${new Date().toISOString()}]: Processing queued save operation`);
                  
                  // Schedule the queued operation after a short delay to prevent race conditions
                  setTimeout(() => {
                    if (typeof callback === 'function') {
                      // First tell the current operation it succeeded
                      callback({
                        success: true,
                        shouldReload: true,
                        message: "Cards added successfully, processing queued operations"
                      });
                    }
                    
                    // Process any queued operations (with a new callback)
                    handleSaveData(data);
                  }, 500);
                } else {
                  // No queued operations, just return success
                  if (typeof callback === 'function') {
                    callback({
                      success: true, 
                      shouldReload: true,
                      message: "Cards added successfully"
                    });
                  }
                }
              },
              error: function(error) {
                console.error("Flashcard app: Error adding cards to bank:", error);
                
                // Reset the save in progress flag
                saveInProgress = false;
                
                if (typeof callback === 'function') {
                  callback({
                    success: false,
                    error: error,
                    message: "Error adding cards to bank"
                  });
                }
              }
            });
          } catch (error) {
            console.error("Flashcard app: Error processing data for bank addition:", error);
            
            // Reset the save in progress flag
            saveInProgress = false;
            
            if (typeof callback === 'function') {
              callback({
                success: false,
                error: error,
                message: "Error processing data for bank addition"
              });
            }
          }
        },
        error: function(error) {
          console.error("Flashcard app: Error retrieving existing data for bank addition:", error);
          
          // Reset the save in progress flag
          saveInProgress = false;
          
          if (typeof callback === 'function') {
            callback({
              success: false,
              error: error,
              message: "Error retrieving existing data"
            });
          }
        }
      });
    } catch (error) {
      console.error("Flashcard app: Error in addToBankDirectAPI:", error);
      
      // Reset the save in progress flag
      saveInProgress = false;
      
      if (typeof callback === 'function') {
        callback({
          success: false,
          error: error,
          message: "Unexpected error in add to bank function"
        });
      }
    }
  }
  
  // Improve the handleSaveData function to better handle queued saves
  let saveInProgress = false;
  let saveQueued = false;
  
  function handleSaveData(data) {
    debugLog("SAVE_DATA REQUEST RECEIVED", {
      preserveFields: data.preserveFields,
      hasRecordId: data.recordId ? "yes" : "no",
      timestamp: new Date().toISOString()
    });
    
    if (saveInProgress) {
      saveQueued = true;
      console.log("Save already in progress, queueing this save");
      
      // Send feedback to parent window
      if (data.source && typeof data.source.postMessage === 'function') {
        data.source.postMessage({
          type: 'SAVE_OPERATION_QUEUED',
          timestamp: new Date().toISOString()
        }, '*');
      }
      
      return;
    }
    
    saveInProgress = true;
    
    // CRITICAL FIX: Check if there are topic shells in the cards array to ensure they get saved to field_2979
    const hasTopicShells = data.cards && Array.isArray(data.cards) && 
                         data.cards.some(item => item.type === 'topic' || item.isShell === true);
    
    if (hasTopicShells) {
      console.log(`[KnackJavascript] Found ${data.cards.filter(item => item.type === 'topic' || item.isShell === true).length} topic shells to save to field_2979`);
    }
    
    // If preserveFields is true but we have topic shells, we need to save to both field_3011 AND field_2979
    if (data.preserveFields && hasTopicShells) {
      console.log("[KnackJavascript] Saving topic shells to field_2979 and handling preserveFields");
      
      // First, get the current record data to perform a proper merge
      getUserDataById(data.recordId, function(existingData) {
        if (!existingData) {
          console.error(`Flashcard app [${new Date().toISOString()}]: Error getting user data for merging`);
          saveInProgress = false;
          return;
        }
        
        // Handle the field_2979 cardBankData update with topic shells
        let existingItems = [];
        try {
          if (existingData[FIELD_MAPPING.cardBankData]) {
            let cardData = existingData[FIELD_MAPPING.cardBankData];
            if (typeof cardData === 'string' && cardData.includes('%')) {
              cardData = safeDecodeURIComponent(cardData);
            }
            existingItems = safeParseJSON(cardData) || [];
            console.log(`[KnackJavascript] Parsed ${existingItems.length} existing items from field_2979`);
          }
        } catch (e) {
          console.error('[KnackJavascript] Error parsing existing items from field_2979:', e);
          existingItems = [];
        }
        
        // Get the sync service for type handling
        const syncService = getSyncService();
        
        // Split the existing items by type to preserve existing cards
        const { topics: existingTopics, cards: existingCards } = syncService.splitByType(existingItems);
        
        console.log(`[KnackJavascript] Found ${existingTopics.length} existing topic shells and ${existingCards.length} existing cards`);
        
        // Create a map of existing topic shells by ID
        const existingTopicMap = new Map();
        existingTopics.forEach(shell => {
          if (shell.id) {
            existingTopicMap.set(shell.id, shell);
          }
        });
        
        // Get only the topic shells from the incoming data
        const incomingTopicShells = data.cards.filter(item => item.type === 'topic' || item.isShell === true);
        const incomingCards = data.cards.filter(item => item.type !== 'topic' && item.isShell !== true);
        
        // Merge topic shells - update existing ones and add new ones
        const mergedTopicShells = [];
        const processedIds = new Set();
        
        // Process incoming topic shells
        incomingTopicShells.forEach(newShell => {
          if (existingTopicMap.has(newShell.id)) {
            // Update existing shell
            const existingShell = existingTopicMap.get(newShell.id);
            mergedTopicShells.push({
              ...existingShell,
              ...newShell,
              updated: new Date().toISOString()
            });
          } else {
            // Add new shell
            mergedTopicShells.push(newShell);
          }
          processedIds.add(newShell.id);
        });
        
        // Add any existing topic shells that weren't in the incoming data
        existingTopics.forEach(shell => {
          if (!processedIds.has(shell.id)) {
            mergedTopicShells.push(shell);
          }
        });
        
        // Combine everything for field_2979
        const finalBankData = [...mergedTopicShells, ...existingCards, ...incomingCards];
        
        console.log(`[KnackJavascript] Merged bank data has ${mergedTopicShells.length} topic shells and ${existingCards.length + incomingCards.length} cards`);
        
        // Now continue with the original preserveFields logic for field_3011
        handlePreserveFieldsDataSave(data.userId || window.currentKnackUser?.id, data, function(success) {
          // After preserveFields handling, update field_2979 with the merged data
          const updateData = {
            [FIELD_MAPPING.cardBankData]: JSON.stringify(finalBankData),
            [FIELD_MAPPING.lastSaved]: new Date().toISOString()
          };
          
          // Update the record with field_2979
          $.ajax({
            url: KNACK_API_URL + '/objects/' + FLASHCARD_OBJECT + '/records/' + data.recordId,
            type: 'PUT',
            headers: {
              'X-Knack-Application-Id': knackAppId,
              'X-Knack-REST-API-Key': knackApiKey,
              'Authorization': Knack.getUserToken(),
              'Content-Type': 'application/json'
            },
            data: JSON.stringify(updateData),
            success: function(response) {
              console.log(`[KnackJavascript] Successfully saved ${finalBankData.length} items to field_2979`);
              saveInProgress = false;
              
              if (saveQueued) {
                saveQueued = false;
                console.log("Processing queued save");
                
                // Process queued save after a short delay
                setTimeout(() => {
                  handleSaveData(data);
                }, 500);
              }
            },
            error: function(error) {
              console.error("[KnackJavascript] Error saving to field_2979:", error);
              saveInProgress = false;
            }
          });
        });
      });
    } else {
      // Existing save logic without our modification
      actualSaveFunction(data).then(() => {
        saveInProgress = false;
        
        if (saveQueued) {
          saveQueued = false;
          console.log("Processing queued save");
          
          // Process queued save after a short delay
          setTimeout(() => {
            handleSaveData(data);
          }, 500);
        }
      }).catch(err => {
        saveInProgress = false;
        console.error("Save failed:", err);
        
        // Send feedback to parent window
        if (data.source && typeof data.source.postMessage === 'function') {
          data.source.postMessage({
            type: 'SAVE_OPERATION_FAILED',
            error: err.message || "Unknown error",
            timestamp: new Date().toISOString()
          }, '*');
        } 
      }); 
    } 
  } // End of handleSaveData function
  
  // Convert existing save functions to use Promises
  function actualSaveFunction(data) {
    return new Promise((resolve, reject) => {
      const userId = window.currentKnackUser?.id; // Keep userId for handlePreserveFieldsDataSave
      const recordId = data.recordId; // Get recordId from data
  
      if (!userId) {
        console.error("Cannot save - missing user ID");
        reject(new Error("Missing user ID"));
        return;
      }
      if (!recordId && !data.preserveFields) { // Need recordId unless preserving fields (which fetches it)
          console.error("Cannot save - missing record ID");
          reject(new Error("Missing record ID"));
          return;
      }
  
      // Handle different save types
      if (data.preserveFields === true) {
        // handlePreserveFieldsDataSave internally gets the recordId if needed
        handlePreserveFieldsDataSave(userId, data, (success) => {
          if (success) {
            resolve(true);
          } else {
            reject(new Error("Preserved fields save failed"));
          }
        });
      } else {
        // Call the refactored saveFlashcardUserData with correct arguments
        saveFlashcardUserData(recordId, data, false, (success, response) => {
          if (success) {
            resolve(true);
          } else {
            // Use the message from the callback if available
            const errorMessage = response && response.message ? response.message : "Save failed";
            reject(new Error(errorMessage));
          }
        });
      }
    });
  }
  
  // Add a generic retry function for API calls
  function retryApiCall(apiCall, maxRetries = 3, delay = 1000) {
    return new Promise((resolve, reject) => {
      const attempt = (retryCount) => {
        apiCall()
          .then(resolve)
          .catch((error) => {
            console.log(`API call failed (attempt ${retryCount + 1}/${maxRetries + 1}): ${error.message || 'Unknown error'}`);
            
            // Check if it's an authentication error
            if (error.status === 403 && retryCount < maxRetries) {
              console.log(`Authentication error detected, attempting to refresh auth...`);
              
              // Try to refresh the auth token
              refreshAuthentication()
                .then(() => {
                  console.log(`Auth refreshed, retrying API call after delay...`);
                  setTimeout(() => attempt(retryCount + 1), delay);
                })
                .catch((refreshError) => {
                  console.error(`Failed to refresh authentication: ${refreshError.message || 'Unknown error'}`);
                  reject(error);
                });
            } else if (retryCount < maxRetries) {
              console.log(`Retrying API call after delay...`);
              setTimeout(() => attempt(retryCount + 1), delay);
            } else {
              reject(error);
            }
          });
      };
      
      attempt(0);
    });
  }
  
  // Function to refresh authentication
  function refreshAuthentication() {
    return new Promise((resolve, reject) => {
      try {
        // Check if we can get a fresh token from Knack
        const currentToken = Knack.getUserToken();
        
        if (currentToken) {
          console.log(`Refreshed authentication with current token`);
          resolve(currentToken);
        } else {
          console.error(`Cannot refresh token - not available from Knack`);
          reject(new Error("Auth token not available"));
        }
      } catch (error) {
        console.error(`Error refreshing authentication:`, error);
        reject(error);
      }
    });
  }
  
  // In KnackJavascript4j.js, add this function:
  
  function handleTokenRefresh() {
    console.log("Handling token refresh request from React app");
    
    try {
      // Get a fresh token from Knack
      const currentToken = Knack.getUserToken();
      
      // Check if token is available
      if (!currentToken) {
        console.error("Cannot get token from Knack");
        
        // Send failure response to React app
        iframe.contentWindow.postMessage({
          type: "AUTH_REFRESH_RESULT",
          success: false,
          error: "Token not available from Knack"
        }, "*");
        
        return;
      }
      
      // Try to re-authenticate with Knack
      Knack.getUserAuthToken(function(freshToken) {
        if (freshToken) {
          // Send successful response to React app
          iframe.contentWindow.postMessage({
            type: "AUTH_REFRESH_RESULT",
            success: true,
            token: freshToken
          }, "*");
          
          console.log("Successfully refreshed token");
        } else {
          // Send failure response to React app
          iframe.contentWindow.postMessage({
            type: "AUTH_REFRESH_RESULT",
            success: false,
            error: "Failed to get fresh token from Knack"
          }, "*");
          
          console.error("Failed to get fresh token from Knack");
        }
      });
    } catch (error) {
      console.error("Error refreshing token:", error);
      
      // Send failure response to React app
      iframe.contentWindow.postMessage({
        type: "AUTH_REFRESH_RESULT",
        success: false,
        error: error.message || "Unknown error refreshing token"
      }, "*");
    }
  }
  
  // Modify the handleAddToBank function to return a Promise
  function handleAddToBankPromise(data) {
    return new Promise((resolve, reject) => {
      handleAddToBank(data, (success) => {
        if (success) {
          resolve(success);
        } else {
          reject(new Error("Failed to add to bank"));
        }
      });
    });
    }
  }());
