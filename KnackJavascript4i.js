// knack-integration.js - Safe for public GitHub repository
(function() {
  // Look for configuration in global scope
  if (!window.VESPA_CONFIG) {
    console.error("Flashcard app: Missing VESPA_CONFIG. Please define configuration in Knack.");
    return;
  }
  
  // Safe URI component decoding function to handle malformed URI components
  function safeDecodeURIComponent(str) {
    if (!str) return str;
    try {
      return decodeURIComponent(str);
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
  
  console.log(`Flashcard app [${new Date().toISOString()}]: Message from React app:`, event.data?.type);
  debugLog("MESSAGE RECEIVED", {
    type: event.data?.type,
    timestamp: new Date().toISOString(),
    hasData: event.data?.data ? "yes" : "no"
  });
  
  if (event.data && event.data.type) {
    switch(event.data.type) {
      case 'APP_READY':
        // Only handle APP_READY once to prevent loops
        if (appReadyHandled) {
          console.log("Flashcard app: Ignoring duplicate APP_READY message");
          return;
        }
        
        // Mark as handled immediately to prevent race conditions
        appReadyHandled = true;
        console.log("Flashcard app: React app is ready, sending user info (first time)");
            
            // First, get user data from Knack
            loadFlashcardUserData(user.id, function(userData) {
              // Check again to prevent double-handling due to async operations
              if (authSent) {
                console.log("Flashcard app: Auth already sent, skipping duplicate send");
                return;
              }
              
              // Include connection field IDs in the data sent to the React app
              const userDataToSend = {
                id: user.id,
                email: user.email,
                name: user.name || '',
                token: userToken,
                appId: appId,
                userData: userData || {},
                // Add connection field IDs
                emailId: currentUser.emailId,
                schoolId: currentUser.schoolId,
                tutorId: currentUser.tutorId,
                roleId: currentUser.roleId
              };
              
              // Send authentication and user data to the iframe only if not already sent
              if (!authSent) {
                iframe.contentWindow.postMessage({
                  type: 'KNACK_USER_INFO',
                  data: userDataToSend
                }, '*');
                
                authSent = true;
                console.log("Flashcard app: Sent user info to React app");
              }
            });
            break;
            
          case 'AUTH_CONFIRMED':
            console.log("Flashcard app: Authentication confirmed by React app");
            
            // Hide loading indicator and show iframe
            loadingDiv.style.display = 'none';
            iframe.style.display = 'block';
            break;
            
      case 'SAVE_DATA':
        console.log(`Flashcard app [${new Date().toISOString()}]: Saving data from React app:`, event.data.data);
        debugLog("SAVE_DATA REQUEST RECEIVED", {
          preserveFields: event.data.data.preserveFields,
          hasRecordId: event.data.data.recordId ? "yes" : "no",
          timestamp: new Date().toISOString()
        });
        
        // Check if preserveFields flag is set (for topic list saving)
        if (event.data.data.preserveFields === true && event.data.data.completeData) {
          console.log(`Flashcard app [${new Date().toISOString()}]: Using data preservation mode for saving`);
          
          // Extract user ID from the message data or use the current user ID
          const userId = event.data.data.userId || user.id;
          
          // Handle preserving fields when saving topic lists
          handlePreserveFieldsDataSave(userId, event.data.data, function(success) {
            debugLog("SAVE_RESULT SENDING", {
              success: success,
              preserveFields: true,
              timestamp: new Date().toISOString()
            });
            
            // Notify the React app about the save result
            iframe.contentWindow.postMessage({
              type: 'SAVE_RESULT',
              success: success,
              timestamp: new Date().toISOString()
            }, '*');
            
            // If save was successful, verify it immediately
            if (success && event.data.data.recordId) {
              verifyDataSave(event.data.data.recordId);
            }
          });
        } else {
          // Standard save operation (original behavior)
          saveFlashcardUserData(user.id, event.data.data, function(success) {
            // Notify the React app about the save result
            iframe.contentWindow.postMessage({
              type: 'SAVE_RESULT',
              success: success
            }, '*');
          });
        }
        break;
            
          case 'ADD_TO_BANK':
            console.log("Flashcard app: Adding cards to bank:", event.data.data);
            
            // Handle adding cards to both the card bank and Box 1
            handleAddToBank(event.data.data, function(success) {
              // Notify the React app about the result
              iframe.contentWindow.postMessage({
                type: 'ADD_TO_BANK_RESULT',
                success: success,
                shouldReload: true // Add flag to trigger reload
              }, '*');
              
              // If successful, also send a reload message after a short delay
              // But DO NOT reload the entire page - just notify the React app
              if (success) {
                setTimeout(() => {
                  iframe.contentWindow.postMessage({
                    type: 'RELOAD_APP_DATA',
                    timestamp: new Date().toISOString()
                  }, '*');
                }, 1000);
              }
            });
            break;
            
          case 'TOPIC_LISTS_UPDATED':
            console.log(`Flashcard app [${new Date().toISOString()}]: Message from React app: TOPIC_LISTS_UPDATED`);
            debugLog("MESSAGE RECEIVED", {
              type: "TOPIC_LISTS_UPDATED",
              timestamp: new Date().toISOString(),
              hasData: event.data.data ? "yes" : "no"
            });
            
            // Create topic shells for the updated topic lists
            if (event.data.data && event.data.data.topicLists && event.data.data.recordId) {
              console.log(`Flashcard app [${new Date().toISOString()}]: Creating topic shells for updated topic lists`);
              createTopicShellsFromLists(event.data.data.topicLists, event.data.data.recordId);
              
              // Added: Force reload the parent page after topic shells are created
              setTimeout(() => {
                window.location.reload();
              }, 2000);
            } else {
              // If we don't have the data in the message, try to load it
              const userId = user.id;
              loadFlashcardUserData(userId, function(userData) {
                if (userData && userData.recordId && userData.topicLists && userData.topicLists.length > 0) {
                  console.log(`Flashcard app [${new Date().toISOString()}]: Creating topic shells from loaded topic lists`);
                  createTopicShellsFromLists(userData.topicLists, userData.recordId);
                  
                  // Added: Force reload the parent page after topic shells are created
                  setTimeout(() => {
                    window.location.reload();
                  }, 2000);
                } else {
                  console.warn(`Flashcard app [${new Date().toISOString()}]: No topic lists found for shell creation`);
                }
              });
            }
            break;
            
          case 'TRIGGER_SAVE':
            console.log("Flashcard app: Triggered save from React app");
            // This is a hint to also save to the card bank
            // Trigger ADD_TO_BANK operation for any unsaved cards
            if (event.data.cards && Array.isArray(event.data.cards) && event.data.cards.length > 0) {
              // If we have cards in the trigger message, add them to bank
              handleAddToBank(event.data, function(success) {
                // We don't need to notify about this automatic operation
              });
            }
            break;
            
          // Added: Handle explicit reload requests
          case 'RELOAD_APP_DATA':
            console.log(`Flashcard app [${new Date().toISOString()}]: Received reload request`);
            // Reload the page to refresh data
            window.location.reload();
            break;
            
          // Add handler for AUTH_REFRESH_NEEDED message
          case 'AUTH_REFRESH_NEEDED':
            console.log(`Flashcard app [${new Date().toISOString()}]: Authentication refresh needed`);
            
            // Attempt to refresh the auth token
            try {
              // First check if we can get a fresh token from Knack
              const currentToken = Knack.getUserToken();
              
              if (currentToken) {
                console.log(`Flashcard app [${new Date().toISOString()}]: Refreshing authentication with current token`);
                
                // Send the current token back to the React app
                if (iframe && iframe.contentWindow) {
                  iframe.contentWindow.postMessage({
                    type: 'AUTH_REFRESH',
                    data: {
                      token: currentToken,
                      userId: user.id,
                      email: user.email,
                      name: user.name || ''
                    },
                    timestamp: new Date().toISOString()
                  }, '*');
                  
                  console.log(`Flashcard app [${new Date().toISOString()}]: Sent refreshed auth token to React app`);
                }
              } else {
                console.error(`Flashcard app [${new Date().toISOString()}]: Cannot refresh token - not available from Knack`);
                
                // Force reload as a last resort
                setTimeout(() => {
                  console.log(`Flashcard app [${new Date().toISOString()}]: Forcing page reload to refresh authentication`);
                  window.location.reload();
                }, 1000);
              }
            } catch (error) {
              console.error(`Flashcard app [${new Date().toISOString()}]: Error refreshing authentication:`, error);
              
              // Force reload as a last resort
              setTimeout(() => {
                console.log(`Flashcard app [${new Date().toISOString()}]: Forcing page reload to refresh authentication`);
                window.location.reload();
              }, 1000);
            }
            break;
            
          // Add handler for REQUEST_UPDATED_DATA message
          case 'REQUEST_UPDATED_DATA':
            console.log(`Flashcard app [${new Date().toISOString()}]: Requested updated data`);
            
            // Get the record ID from the message or use the current user
            const dataUserId = user.id;
            const dataRecordId = event.data.recordId;
            
            if (!dataRecordId) {
              console.error("Flashcard app: Cannot refresh data - missing record ID");
              iframe.contentWindow.postMessage({
                type: 'DATA_REFRESH_ERROR',
                error: 'Missing record ID'
              }, '*');
              return;
            }
            
            // Load the latest data directly
            loadFlashcardUserData(dataUserId, function(userData) {
              if (userData) {
                console.log(`Flashcard app [${new Date().toISOString()}]: Sending refreshed data to React app`);
                
                // Send updated data back to the React app
                iframe.contentWindow.postMessage({
                  type: 'KNACK_DATA',
                  cards: userData.cards || [],
                  colorMapping: userData.colorMapping || {},
                  topicLists: userData.topicLists || [],
                  topicMetadata: userData.topicMetadata || [],
                  recordId: dataRecordId,
                  auth: {
                    id: user.id,
                    email: user.email,
                    name: user.name || ''
                  },
                  timestamp: new Date().toISOString()
                }, '*');
              } else {
                console.error(`Flashcard app [${new Date().toISOString()}]: Error loading updated data`);
                iframe.contentWindow.postMessage({
                  type: 'DATA_REFRESH_ERROR',
                  error: 'Failed to load data'
                }, '*');
              }
            });
            break;
}
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

  // First, check if the user already has a flashcard record
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
      format: 'raw',
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
      console.log("Flashcard app: User data search response:", response);
      
      if (response.records && response.records.length > 0) {
        // User has existing data
        const record = response.records[0];
        console.log("Flashcard app: Found existing user data:", record);
        
        // Parse the JSON data
        let userData = {};
        
        try {
          // Parse cards data
          if (record[FIELD_MAPPING.cardBankData]) {
            // Make sure to decode URL-encoded data if needed
            let cardData = record[FIELD_MAPPING.cardBankData];
            if (typeof cardData === 'string' && cardData.includes('%')) {
              cardData = safeDecodeURIComponent(cardData);
            }
            
            // Parse the card data
            let cardArray = safeParseJSON(cardData) || [];
            
            // Migrate legacy type fields to questionType
            cardArray = migrateTypeToQuestionType(cardArray);
            
            // Store migrated cards
            userData.cards = cardArray;
            
            console.log(`Flashcard app: Loaded ${userData.cards.length} cards, including ${userData.cards.filter(c => c.questionType === 'multiple_choice').length} multiple choice cards`);
          } else {
            userData.cards = [];
          }
          
          // Parse color mapping
          if (record[FIELD_MAPPING.colorMapping]) {
            // Make sure to decode URL-encoded data if needed
            let colorData = record[FIELD_MAPPING.colorMapping];
            if (typeof colorData === 'string' && colorData.includes('%')) {
              colorData = safeDecodeURIComponent(colorData);
            }
            userData.colorMapping = safeParseJSON(colorData) || {};
          } else {
            userData.colorMapping = {};
          }
          
          // Parse topic lists data
          if (record[FIELD_MAPPING.topicLists]) {
            // Make sure to decode URL-encoded data if needed
            let topicListData = record[FIELD_MAPPING.topicLists];
            if (typeof topicListData === 'string' && topicListData.includes('%')) {
              topicListData = safeDecodeURIComponent(topicListData);
            }
            userData.topicLists = safeParseJSON(topicListData) || [];
          } else {
            userData.topicLists = [];
          }
          
          // Parse topic metadata
          if (record[FIELD_MAPPING.topicMetadata]) {
            // Make sure to decode URL-encoded data if needed
            let topicMetadata = record[FIELD_MAPPING.topicMetadata];
            if (typeof topicMetadata === 'string' && topicMetadata.includes('%')) {
              topicMetadata = safeDecodeURIComponent(topicMetadata);
            }
            userData.topicMetadata = safeParseJSON(topicMetadata) || [];
          } else {
            userData.topicMetadata = [];
          }
          
          // Parse spaced repetition data
          const srData = {
            box1: [],
            box2: [],
            box3: [],
            box4: [],
            box5: []
          };
          
          // Handle box 1
          if (record[FIELD_MAPPING.box1Data]) {
            let box1Data = record[FIELD_MAPPING.box1Data];
            if (typeof box1Data === 'string' && box1Data.includes('%')) {
              box1Data = safeDecodeURIComponent(box1Data);
            }
            srData.box1 = safeParseJSON(box1Data) || [];
          }
          
          // Handle box 2
          if (record[FIELD_MAPPING.box2Data]) {
            let box2Data = record[FIELD_MAPPING.box2Data];
            if (typeof box2Data === 'string' && box2Data.includes('%')) {
              box2Data = safeDecodeURIComponent(box2Data);
            }
            srData.box2 = safeParseJSON(box2Data) || [];
          }
          
          // Handle box 3
          if (record[FIELD_MAPPING.box3Data]) {
            let box3Data = record[FIELD_MAPPING.box3Data];
            if (typeof box3Data === 'string' && box3Data.includes('%')) {
              box3Data = safeDecodeURIComponent(box3Data);
            }
            srData.box3 = safeParseJSON(box3Data) || [];
          }
          
          // Handle box 4
          if (record[FIELD_MAPPING.box4Data]) {
            let box4Data = record[FIELD_MAPPING.box4Data];
            if (typeof box4Data === 'string' && box4Data.includes('%')) {
              box4Data = safeDecodeURIComponent(box4Data);
            }
            srData.box4 = safeParseJSON(box4Data) || [];
          }
          
          // Handle box 5
          if (record[FIELD_MAPPING.box5Data]) {
            let box5Data = record[FIELD_MAPPING.box5Data];
            if (typeof box5Data === 'string' && box5Data.includes('%')) {
              box5Data = safeDecodeURIComponent(box5Data);
            }
            srData.box5 = safeParseJSON(box5Data) || [];
          }
        
          userData.spacedRepetition = srData;
          
          // Store the record ID for later updates
          userData.recordId = record.id;
          
        } catch (e) {
          console.error("Flashcard app: Error parsing user data:", e);
        }
        
        callback(userData);
      } else {
        // No existing data, create a new record
        console.log("Flashcard app: No existing user data found, creating new record");
        createFlashcardUserRecord(userId, function(success, recordId) {
          if (success) {
            callback({
              recordId: recordId,
              cards: [],
              colorMapping: {},
              topicLists: [],
              topicMetadata: [],
              spacedRepetition: {
                box1: [],
                box2: [],
                box3: [],
                box4: [],
                box5: []
              }
            });
          } else {
            callback(null);
          }
        });
      }
    },
    error: function(error) {
      console.error("Flashcard app: Error loading user data:", error);
      callback(null);
    }
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

// Add this function near the standardizeCards function
// This is the final check before saving to Knack to ensure multiple choice cards are properly typed
function ensureMultipleChoiceTyping(cards) {
  if (!Array.isArray(cards)) return cards;
  
  console.log(`[${new Date().toISOString()}] Final check: Ensuring multiple choice typing for ${cards.length} cards`);
  let fixedCount = 0;
  
  const result = cards.map(card => {
    // Skip non-card items like topic shells
    if (!card || card.type === 'topic' || card.isShell) {
      return card;
    }
    
    // Deep clone to avoid reference issues
    const fixedCard = JSON.parse(JSON.stringify(card));
    
    // Check for multiple choice pattern in the answer
    if (fixedCard.answer && typeof fixedCard.answer === 'string' && 
        fixedCard.answer.match(/Correct Answer:\s*[a-e]\)/i)) {
      
      // Set questionType to 'multiple_choice'
      if (fixedCard.questionType !== 'multiple_choice') {
        fixedCard.questionType = 'multiple_choice';
        fixedCount++;
      }
      
      // Remove 'type' field if it refers to question format
      if (fixedCard.type === 'multiple_choice' || fixedCard.type === 'short_answer') {
        delete fixedCard.type;
        fixedCount++;
      }
      
      // Extract correct answer and create options if missing
      if (!fixedCard.options || !Array.isArray(fixedCard.options) || fixedCard.options.length === 0) {
        const match = fixedCard.answer.match(/Correct Answer:\s*([a-e])\)/i);
        if (match) {
          const correctLetter = match[1].toLowerCase();
          const letters = ['a', 'b', 'c', 'd', 'e'];
          const options = [];
          
          // Create options with the correct one marked
          letters.slice(0, 4).forEach(letter => {
            options.push({
              text: letter === correctLetter ? 
                  (fixedCard.detailedAnswer || 'Correct option') : 
                  `Option ${letter.toUpperCase()}`,
              isCorrect: letter === correctLetter
            });
          });
          
          fixedCard.options = options;
          fixedCard.savedOptions = [...options];
          console.log(`[${new Date().toISOString()}] Created options for card ${fixedCard.id}`);
        }
      }
    }
    
    // Always check if this is a multiple choice card that needs option preservation
    if (fixedCard.questionType === 'multiple_choice' || fixedCard.type === 'multiple_choice') {
      // Use questionType consistently, remove legacy type fields
      fixedCard.questionType = 'multiple_choice';
      
      // Remove type field if it's for question format
      if (fixedCard.type === 'multiple_choice' || fixedCard.type === 'short_answer') {
        delete fixedCard.type;
      }
      
      // Apply fixes to options if needed
      if (!fixedCard.options || !Array.isArray(fixedCard.options) || fixedCard.options.length === 0) {
        if (fixedCard.savedOptions && Array.isArray(fixedCard.savedOptions) && fixedCard.savedOptions.length > 0) {
          fixedCard.options = [...fixedCard.savedOptions];
          console.log(`[${new Date().toISOString()}] Restored missing options for card ${fixedCard.id}`);
        }
      } else if (!fixedCard.savedOptions || !Array.isArray(fixedCard.savedOptions) || fixedCard.savedOptions.length === 0) {
        fixedCard.savedOptions = [...fixedCard.options];
        console.log(`[${new Date().toISOString()}] Backed up options for card ${fixedCard.id}`);
      }
    }
    
    return fixedCard;
  });
  
  console.log(`[${new Date().toISOString()}] Fixed typing for ${fixedCount} fields in ${cards.filter(c => 
    c && c.answer && typeof c.answer === 'string' && c.answer.match(/Correct Answer:\s*[a-e]\)/i)
  ).length} multiple choice cards`);
  
  return result;
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
  
  // Get the complete data provided
  const completeData = data.completeData;
  
  // Get cleaned versions of the topic data we want to update
  const cleanTopicLists = ensureDataIsSerializable(data.topicLists || []);
  const cleanTopicMetadata = ensureDataIsSerializable(data.topicMetadata || []);
  
  // Create an update object that contains ONLY the fields we want to update
  // while preserving all other fields
  const updateData = {
    // Only update the following fields
    [FIELD_MAPPING.topicLists]: JSON.stringify(cleanTopicLists),
    [FIELD_MAPPING.topicMetadata]: JSON.stringify(cleanTopicMetadata),
    [FIELD_MAPPING.lastSaved]: new Date().toISOString()
  };
  
  // Log what we're updating
  debugLog("UPDATING ONLY THESE FIELDS (PRESERVING OTHERS)", {
    topicListsCount: cleanTopicLists.length,
    topicMetadataCount: cleanTopicMetadata.length,
    recordId: recordId,
    timestamp: new Date().toISOString()
  });
  
  // Implement retry mechanism for more reliable saving
  let retryCount = 0;
  const maxRetries = 2;
  
  function attemptSave() {
    // Save to Knack
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
        console.log(`Flashcard app [${new Date().toISOString()}]: Successfully saved topic list data:`, response.id);
        debugLog("SAVE SUCCESS", {
          recordId: response.id,
          timestamp: new Date().toISOString()
        });
        
        // If successful, verify the save immediately
        verifyDataSave(recordId);
        
        // IMPORTANT: Create topic shells immediately when topic lists are saved
        if (cleanTopicLists && cleanTopicLists.length > 0) {
          console.log(`Flashcard app [${new Date().toISOString()}]: Creating topic shells for ${cleanTopicLists.length} topic lists`);
          createTopicShellsFromLists(cleanTopicLists, recordId);
        } else {
          console.log(`Flashcard app [${new Date().toISOString()}]: No topic lists to create shells from`);
        }
        
        callback(true);
      },
      error: function(error) {
        console.error(`Flashcard app [${new Date().toISOString()}]: Error saving topic list data:`, error);
        debugLog("SAVE ERROR", {
          recordId: recordId,
          errorStatus: error.status,
          errorText: error.statusText,
          retryCount: retryCount
        });
        
        // Retry logic for failed saves
        if (retryCount < maxRetries) {
          console.log(`Flashcard app [${new Date().toISOString()}]: Retrying save (${retryCount + 1}/${maxRetries})...`);
          retryCount++;
          // Wait before retrying
          setTimeout(attemptSave, 1000);
        } else {
          callback(false);
        }
      }
    });
  }
  
  // Start the save process
  attemptSave();
}

// Verify that data was saved correctly and fix any issues
function verifyDataSave(recordId) {
  console.log(`Flashcard app [${new Date().toISOString()}]: Verifying data save for record:`, recordId);
  
  // Wait a moment to ensure data has been committed to the database
  setTimeout(function() {
    // Fetch the record to verify the data is there
    $.ajax({
      url: KNACK_API_URL + '/objects/' + FLASHCARD_OBJECT + '/records/' + recordId,
      type: 'GET',
      headers: {
        'X-Knack-Application-Id': knackAppId,
        'X-Knack-REST-API-Key': knackApiKey,
        'Authorization': Knack.getUserToken(),
        'Content-Type': 'application/json'
      },
      success: function(response) {
        debugLog("VERIFICATION RESULT", {
          recordId: recordId,
          hasTopicLists: response && response[FIELD_MAPPING.topicLists] ? "yes" : "no",
          hasCardBank: response && response[FIELD_MAPPING.cardBankData] ? "yes" : "no",
          timestamp: new Date().toISOString()
        });
        
        // Verify topic lists if present
        if (response && response[FIELD_MAPPING.topicLists]) {
          try {
            const topicListsJson = response[FIELD_MAPPING.topicLists];
            const topicLists = safeParseJSON(topicListsJson);
            
            if (Array.isArray(topicLists) && topicLists.length > 0) {
              console.log(`Flashcard app [${new Date().toISOString()}]: Verification successful: Topic lists present with ${topicLists.length} items`);
              
              // Check if any of the topic lists have topics
              const hasSomeTopics = topicLists.some(list => 
                list.topics && Array.isArray(list.topics) && list.topics.length > 0
              );
              
              if (hasSomeTopics) {
                console.log(`Flashcard app [${new Date().toISOString()}]: Topic lists contain topics - save fully verified`);
                
                // Now check if topic shells were created in the card bank
                if (response && response[FIELD_MAPPING.cardBankData]) {
                  const cardBankJson = response[FIELD_MAPPING.cardBankData];
                  const cardBank = safeParseJSON(cardBankJson);
                  
                  if (Array.isArray(cardBank)) {
                    // Count topic shells and cards
                    const topicShells = cardBank.filter(item => item.type === 'topic');
                    const cards = cardBank.filter(item => item.type !== 'topic');
                    
                    console.log(`Flashcard app [${new Date().toISOString()}]: Card bank contains ${topicShells.length} topic shells and ${cards.length} cards`);
                    
                    // Check if we need to create topic shells
                    if (topicShells.length === 0 && hasSomeTopics) {
                      console.warn(`Flashcard app [${new Date().toISOString()}]: No topic shells found in card bank but topic lists exist - creating topic shells`);
                      
                      // Create topic shells from topic lists
                      createTopicShellsFromLists(topicLists, recordId);
                    }
                    
                    // Check if cards are properly associated with topic shells
                    const cardsWithTopicIds = cards.filter(card => card.topicId);
                    console.log(`Flashcard app [${new Date().toISOString()}]: ${cardsWithTopicIds.length} of ${cards.length} cards have topicId references`);
                  }
                }
              } else {
                console.warn(`Flashcard app [${new Date().toISOString()}]: Topic lists exist but none have topics`);
              }
            } else {
              console.error(`Flashcard app [${new Date().toISOString()}]: Verification failed: Topic lists empty or malformed`);
            }
          } catch (e) {
            console.error(`Flashcard app [${new Date().toISOString()}]: Error parsing topic lists during verification:`, e);
          }
        } else {
          console.warn(`Flashcard app [${new Date().toISOString()}]: No topic lists field found during verification`);
        }
      },
      error: function(error) {
        console.error(`Flashcard app [${new Date().toISOString()}]: Verification error:`, error);
      }
    });
  }, 2000); // Wait 2 seconds before verification
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
    
    console.log(`Flashcard app [${new Date().toISOString()}]: Creating topic shells from ${topicLists.length} topic lists`);
    
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
                
                // Also send a reload signal as a separate message to ensure it gets processed
                setTimeout(() => {
                  iframe.contentWindow.postMessage({
                    type: 'RELOAD_APP_DATA',
                    timestamp: new Date().toISOString()
                  }, '*');
                }, 500);
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
    console.error(`Flashcard app [${new Date().toISOString()}]: Error in createTopicShellsFromLists:`, error);
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
function saveFlashcardUserData(userId, data, callback) {
  console.log("Flashcard app: Saving flashcard data for user:", userId);
  debugLog("SAVING DATA WITH RECORD ID", data.recordId);

  // Check if we have a record ID
  if (!data.recordId) {
    // No record ID, try to load the user data first
    loadFlashcardUserData(userId, function(userData) {
      if (userData && userData.recordId) {
        // Now we have a record ID, save the data
        data.recordId = userData.recordId;
        saveFlashcardUserData(userId, data, callback);
      } else {
        console.error("Flashcard app: Cannot save data - no record ID found");
        callback(false);
      }
    });
    return;
  }

  // Get the current user for additional field data
  const user = window.currentKnackUser || {};

  try {
    // First migrate any legacy type fields to questionType
    const migratedCards = migrateTypeToQuestionType(data.cards || []);
    
    // Ensure cards are in standard format before saving
    const standardizedCards = standardizeCards(migratedCards);
    
    // Apply final multiple choice typing check before save
    const fullyProcessedCards = ensureMultipleChoiceTyping(standardizedCards);
    
    // Make sure data is serializable (no circular references)
    const cleanCards = ensureDataIsSerializable(fullyProcessedCards);
    
    // Add diagnostic log to see what card types are being saved
    const multipleChoiceCount = cleanCards.filter(c => 
      c.questionType === 'multiple_choice'
    ).length;
    
    console.log(`[${new Date().toISOString()}] About to save ${cleanCards.length} cards, including ${multipleChoiceCount} multiple choice cards`);
    
    const cleanColorMapping = ensureDataIsSerializable(data.colorMapping || {});
    const cleanSpacedRepetition = ensureDataIsSerializable(data.spacedRepetition || {
      box1: [], box2: [], box3: [], box4: [], box5: []
    });
    const cleanTopicLists = ensureDataIsSerializable(data.topicLists || []);
    const cleanTopicMetadata = ensureDataIsSerializable(data.topicMetadata || []);
    
    // Get current data first to preserve topic shells
    $.ajax({
      url: KNACK_API_URL + '/objects/' + FLASHCARD_OBJECT + '/records/' + data.recordId,
      type: 'GET',
      headers: {
        'X-Knack-Application-Id': knackAppId,
        'X-Knack-REST-API-Key': knackApiKey,
        'Authorization': Knack.getUserToken(),
        'Content-Type': 'application/json'
      },
      success: function(existingData) {
        // Parse existing card bank data
        let existingItems = [];
        if (existingData[FIELD_MAPPING.cardBankData]) {
          let cardData = existingData[FIELD_MAPPING.cardBankData];
          if (typeof cardData === 'string' && cardData.includes('%')) {
            cardData = safeDecodeURIComponent(cardData);
          }
          existingItems = safeParseJSON(cardData) || [];
        }
        
        // Migrate any legacy type fields to questionType
        existingItems = migrateTypeToQuestionType(existingItems);
        
        // Get the sync service for type handling
        const syncService = getSyncService();
        
        // Split by type to preserve topic shells
        const { topics: topicShells, cards: existingCards } = syncService.splitByType(existingItems);
        
        debugLog("SPLIT BANK ITEMS BY TYPE FOR SAVE", {
          totalItems: existingItems.length,
          topicShellCount: topicShells.length,
          cardCount: existingCards.length
        });
        
        // Create a map to track topic shells by ID
        const topicShellMap = new Map();
        topicShells.forEach(shell => {
          topicShellMap.set(shell.id, shell);
        });
        
        // Process cards to update topicId references and deduplicate
        const processedCards = [];
        const cardIdMap = new Map();
        
        // First pass: Process cards with IDs and deduplicate
        cleanCards.forEach(card => {
          // Skip if we've already processed a card with this ID
          if (card.id && cardIdMap.has(card.id)) {
            return;
          }
          
          // Store in our processed map
          if (card.id) {
            cardIdMap.set(card.id, true);
          }
          
          // If card has a topic, try to associate with a topic shell
          if (card.topic && card.subject) {
            // Find matching topic shell by name/topic and subject
            const matchingShell = topicShells.find(shell => 
              (shell.name === card.topic || shell.topic === card.topic) && 
              shell.subject === card.subject
            );
            
            if (matchingShell) {
              // Connect to the topic shell
              processedCards.push({
                ...card,
                topicId: matchingShell.id
              });
              return;
            }
          }
          
          // If no match found, keep the card as is
          processedCards.push(card);
        });
        
        // CRITICAL: Combine topic shells with new cards
        const finalBankData = [...topicShells, ...processedCards];
        
        // CRITICAL: Preserve existing topic lists if not explicitly provided
        let finalTopicLists = cleanTopicLists;
        if ((!cleanTopicLists || cleanTopicLists.length === 0) && existingData[FIELD_MAPPING.topicLists]) {
          const existingTopicLists = safeParseJSON(existingData[FIELD_MAPPING.topicLists]);
          if (Array.isArray(existingTopicLists) && existingTopicLists.length > 0) {
            console.log("Preserving existing topic lists:", existingTopicLists.length);
            finalTopicLists = existingTopicLists;
          }
        }
        
        // Prepare the update data
        const updateData = {
          [FIELD_MAPPING.lastSaved]: new Date().toISOString(),
          [FIELD_MAPPING.cardBankData]: JSON.stringify(finalBankData),
          [FIELD_MAPPING.colorMapping]: JSON.stringify(cleanColorMapping)
        };
        
        // Add any extra fields passed from the React app
        if (data.additionalFields && typeof data.additionalFields === 'object') {
          // Merge in additional fields
          Object.entries(data.additionalFields).forEach(([key, value]) => {
            // Ensure sanitization for text fields
            updateData[key] = typeof value === 'string' ? sanitizeField(value) : value;
          });
        }
        
        // Add topic lists if available
        updateData[FIELD_MAPPING.topicLists] = JSON.stringify(finalTopicLists);
        
        // Add topic metadata if available
        updateData[FIELD_MAPPING.topicMetadata] = JSON.stringify(cleanTopicMetadata);
        
        // Add user name (not a connection field)
        if (user.name) updateData[FIELD_MAPPING.userName] = sanitizeField(user.name);
        
        // Add non-connection fields
        if (user.tutorGroup) updateData[FIELD_MAPPING.tutorGroup] = sanitizeField(user.tutorGroup);
        if (user.yearGroup) updateData[FIELD_MAPPING.yearGroup] = sanitizeField(user.yearGroup);
        
        // Add regular text email (not a connection)
        if (user.email) updateData[FIELD_MAPPING.userEmail] = sanitizeField(user.email);
        
        // Only add connection fields if they have valid IDs
        // Email connection field (field_2956) - only add if it's a valid ID
        const emailId = extractValidRecordId(user.id); // User's own ID is used for email connection
        if (emailId) {
          updateData[FIELD_MAPPING.accountConnection] = emailId;
        }
        
        // VESPA Customer/school (field_3008) - only add if it's a valid ID 
        const schoolId = extractValidRecordId(user.school || user.field_122);
        if (schoolId) {
          updateData[FIELD_MAPPING.vespaCustomer] = schoolId;
        }
        
        // Tutor connection (field_3009) - only add if it's a valid ID
        const tutorId = extractValidRecordId(user.tutor);
        if (tutorId) {
          updateData[FIELD_MAPPING.tutorConnection] = tutorId;
        }
        
        // User Role (field_73) - only add if it's a valid ID
        const roleId = extractValidRecordId(user.role);
        if (roleId) {
          updateData[FIELD_MAPPING.userRole] = roleId;
        }
        
        // Add spaced repetition data
        updateData[FIELD_MAPPING.box1Data] = JSON.stringify(cleanSpacedRepetition.box1 || []);
        updateData[FIELD_MAPPING.box2Data] = JSON.stringify(cleanSpacedRepetition.box2 || []);
        updateData[FIELD_MAPPING.box3Data] = JSON.stringify(cleanSpacedRepetition.box3 || []);
        updateData[FIELD_MAPPING.box4Data] = JSON.stringify(cleanSpacedRepetition.box4 || []);
        updateData[FIELD_MAPPING.box5Data] = JSON.stringify(cleanSpacedRepetition.box5 || []);
        
        // Log the data we're sending
        debugLog("SAVING TO KNACK: DATA STATS", {
          topicShellCount: topicShells.length,
          cardsCount: processedCards.length,
          colorCount: Object.keys(cleanColorMapping).length,
          spacedRepCount: Object.values(cleanSpacedRepetition).flat().length
        });
        
        // Pause briefly before saving to ensure any UI updates have completed
        setTimeout(function() {
          // Update the record
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
              console.log("Flashcard app: Successfully saved user data:", response.id);
              debugLog("KNACK SAVE SUCCESS", {
                userId: userId,
                recordId: response.id,
                timestamp: new Date().toISOString()
              });
              
              // Verify the save to check for and fix any incorrect types
              verifyDataSave(response.id);
              
              callback(true);
            },
            error: function(error) {
              console.error("Flashcard app: Error saving user data:", error);
              debugLog("KNACK SAVE ERROR", error);
              callback(false);
            }
          });
        }, 100);
      },
      error: function(error) {
        console.error("Flashcard app: Error retrieving existing data:", error);
        callback(false);
      }
    });
  } catch (error) {
    console.error("Flashcard app: Error preparing data for saving:", error);
    callback(false);
  }
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
    
    // Ensure we have a record ID
    if (!recordId) {
      // No record ID, try to load the user data first
      loadFlashcardUserData(userId, function(userData) {
        if (userData && userData.recordId) {
          // Now we have a record ID, retry adding to bank
          data.recordId = userData.recordId;
          handleAddToBank(data, callback);
        } else {
          console.error("Flashcard app: Cannot add to bank - no record ID found");
          callback(false);
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
              
              // Return success but don't trigger reload - let parent handle that if needed
              callback(true);
            },
            error: function(error) {
              console.error("Flashcard app: Error adding cards to bank:", error);
              callback(false);
            }
          });
        } catch (error) {
          console.error("Flashcard app: Error processing data for bank addition:", error);
          callback(false);
        }
      },
      error: function(error) {
        console.error("Flashcard app: Error retrieving existing data for bank addition:", error);
        callback(false);
      }
    });
  } catch (error) {
    console.error("Flashcard app: Error in handleAddToBank:", error);
    callback(false);
  }
}
})();
