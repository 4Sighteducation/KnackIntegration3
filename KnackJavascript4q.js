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
        
        // Use our debounced save handler instead of direct calls
        const saveResult = handleSaveData(event.data.data);
        
        // We'll still notify about the save operation being received
        iframe.contentWindow.postMessage({
          type: 'SAVE_OPERATION_QUEUED',
          timestamp: new Date().toISOString()
        }, '*');
        break;
            
          case 'ADD_TO_BANK':
            console.log("Flashcard app: Adding cards to bank:", event.data.data);
            
            // Prevent multiple operations by setting a flag
            if (window.addToBankInProgress) {
              console.log("Add to bank operation already in progress, ignoring duplicate request");
              return;
            }
            
            window.addToBankInProgress = true;
            
            // Use our Promise-based approach
            handleAddToBankPromise(event.data.data)
              .then((success) => {
                // Notify the React app about the result
                iframe.contentWindow.postMessage({
                  type: 'ADD_TO_BANK_RESULT',
                  success: true,
                  shouldReload: true
                }, '*');
                
                // Wait before sending a update message to ensure database commits are complete
                setTimeout(() => {
                  iframe.contentWindow.postMessage({
                    type: 'REQUEST_UPDATED_DATA',
                    recordId: recordId,
                    timestamp: new Date().toISOString()
                  }, '*');
                  
                  // Reset flag
                  window.addToBankInProgress = false;
                }, 2000); // Keep 2 second delay for safer operation
              })
              .catch((error) => {
                console.error("Failed to add cards to bank:", error);
                
                // Notify about failure
                iframe.contentWindow.postMessage({
                  type: 'ADD_TO_BANK_RESULT',
                  success: false,
                  error: error.message
                }, '*');
                
                // Reset flag
                window.addToBankInProgress = false;
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
  
  // Instead of reloading the page, send updated data to the iframe
  if (iframe && iframe.contentWindow) {
    // Get the user ID for data loading
    const reloadUserId = user.id;
    
    // Load the latest data and send it to the iframe
    loadFlashcardUserData(reloadUserId, function(userData) {
      if (userData) {
        console.log(`Flashcard app [${new Date().toISOString()}]: Sending refreshed data to React app instead of reloading page`);
        
        // Send updated data back to the React app
        iframe.contentWindow.postMessage({
          type: 'KNACK_DATA',
          cards: userData.cards || [],
          colorMapping: userData.colorMapping || {},
          topicLists: userData.topicLists || [],
          topicMetadata: userData.topicMetadata || [],
          recordId: userData.recordId,
          auth: {
            id: user.id,
            email: user.email,
            name: user.name || ''
          },
          timestamp: new Date().toISOString()
        }, '*');
      } else {
        console.error(`Flashcard app [${new Date().toISOString()}]: Error loading updated data for reload`);
        
        // As a last resort if data loading fails, notify the iframe
        iframe.contentWindow.postMessage({
          type: 'DATA_REFRESH_ERROR',
          error: 'Failed to load data for reload'
        }, '*');
      }
    });
  } else {
    // If we can't communicate with the iframe, fall back to a full page reload
    console.log(`Flashcard app [${new Date().toISOString()}]: No iframe to communicate with, falling back to full page reload`);
    window.location.reload();
  }
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
  
// Add handler for REQUEST_TOKEN_REFRESH message
case 'REQUEST_TOKEN_REFRESH':
  handleTokenRefresh();
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
            
          // Add handler for REQUEST_RECORD_ID message
          case 'REQUEST_RECORD_ID':
            console.log(`Flashcard app [${new Date().toISOString()}]: Record ID requested from React app`);
            
            // Get the user's record ID
            const currentUserId = user.id;
            
            // Look up the record ID for this user
            loadFlashcardUserData(currentUserId, function(userData) {
              if (userData && userData.recordId) {
                console.log(`Flashcard app [${new Date().toISOString()}]: Found record ID for user: ${userData.recordId}`);
                
                // Send the record ID back to the React app
                iframe.contentWindow.postMessage({
                  type: 'RECORD_ID_RESPONSE',
                  recordId: userData.recordId,
                  timestamp: new Date().toISOString()
                }, '*');
              } else {
                console.error(`Flashcard app [${new Date().toISOString()}]: Could not find record ID for user ${currentUserId}`);
                
                // Send an error response
                iframe.contentWindow.postMessage({
                  type: 'RECORD_ID_ERROR',
                  error: 'Record ID not found',
                  timestamp: new Date().toISOString()
                }, '*');
              }
            });
            break;

      case 'PERSISTENCE_SERVICES_READY':
        console.log("Flashcard app: Received persistence services from React app");
        
        // Store the services in window for use by our functions
        if (event.data.services) {
          window.unifiedPersistenceManager = event.data.services.unifiedPersistenceManager;
          window.topicShellManager = event.data.services.topicShellManager;
          window.metadataManager = event.data.services.metadataManager;
          window.colorManager = event.data.services.colorManager;
          window.dataOperationQueue = event.data.services.dataOperationQueue;
          
          console.log("Flashcard app: Persistence services ready for use");
          
          // Load services to verify they're available
          if (loadPersistenceServices()) {
            // Acknowledge receipt of services
            iframe.contentWindow.postMessage({
              type: 'PERSISTENCE_SERVICES_ACKNOWLEDGED',
              timestamp: new Date().toISOString()
            }, '*');
          }
        }
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
  
  // Try to use UnifiedPersistenceManager if available
  if (loadPersistenceServices()) {
    console.log("Flashcard app: Using UnifiedPersistenceManager for loading data");
    
    // Get Auth data from Knack
    const auth = {
      token: Knack.getUserToken(),
      userId: userId,
      email: window.currentKnackUser?.email,
      name: window.currentKnackUser?.name
    };
    
    // Use UnifiedPersistenceManager to load data
    unifiedPersistenceManager.loadUserData(userId, auth)
      .then(userData => {
        console.log("Flashcard app: Successfully loaded user data with UnifiedPersistenceManager");
        callback(userData);
      })
      .catch(error => {
        console.error("Flashcard app: Error loading user data with UnifiedPersistenceManager:", error);
        
        // Fall back to legacy loading method
        console.log("Flashcard app: Falling back to legacy loading method");
        legacyLoadFlashcardUserData(userId, callback);
      });
  } else {
    // Use legacy method if UnifiedPersistenceManager not available
    legacyLoadFlashcardUserData(userId, callback);
  }
}

// Legacy load function (original implementation)
function legacyLoadFlashcardUserData(userId, callback) {
  console.log("Flashcard app: Loading user data with legacy method for:", userId);
  
  // Original loadFlashcardUserData implementation
  // Simply copy your current implementation here
  
  // Create a function that returns a Promise for the API call
  const apiCall = () => {
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
          resolve(response);
        },
        error: function(error) {
          reject(error);
        }
      });
    });
  };

  // Rest of your original implementation...
  // [Keep your existing code here]
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
          if (mergedTopicLists && mergedTopicLists.length > 0) {
            console.log(`Flashcard app [${new Date().toISOString()}]: Creating topic shells for ${mergedTopicLists.length} topic lists`);
            createTopicShellsFromLists(mergedTopicLists, recordId);
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
  });
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
    
    // Try to use UnifiedPersistenceManager if available
    if (loadPersistenceServices() && topicShellManager) {
      console.log(`Flashcard app [${new Date().toISOString()}]: Using TopicShellManager for creating topic shells`);
      
      // Extract topics from topic lists
      const topics = [];
      topicLists.forEach(list => {
        if (list.topics && Array.isArray(list.topics)) {
          list.topics.forEach(topic => {
            topics.push({
              id: topic.id || `topic_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
              name: topic.name || topic.topic || "Unknown Topic",
              subject: list.subject || "General",
              examBoard: list.examBoard || "General",
              examType: list.examType || "Course",
              color: topic.color
            });
          });
        }
      });
      
      // Start a transaction
      unifiedPersistenceManager.beginTransaction();
      
      // Create topic shells using TopicShellManager
      const createdShells = topics.map(topic => {
        return topicShellManager.createOrUpdateTopicShell(topic);
      });
      
      // Save the topic shells
      unifiedPersistenceManager.saveTopics(createdShells)
        .then(() => {
          // Also save the topic lists
          unifiedPersistenceManager.addTransactionOperation({
            type: 'saveTopicLists',
            data: topicLists
          });
          
          // Commit the transaction
          return unifiedPersistenceManager.commitTransaction();
        })
        .then(() => {
          console.log(`Flashcard app [${new Date().toISOString()}]: Successfully created ${createdShells.length} topic shells with TopicShellManager`);
          
          // Notify the React app
          const iframe = document.getElementById('flashcard-app-iframe');
          if (iframe && iframe.contentWindow) {
            iframe.contentWindow.postMessage({
              type: 'TOPIC_SHELLS_CREATED',
              timestamp: new Date().toISOString(),
              count: createdShells.length,
              shouldReload: true
            }, '*');
          }
        })
        .catch(error => {
          console.error(`Flashcard app [${new Date().toISOString()}]: Error creating topic shells with TopicShellManager:`, error);
          
          // Roll back the transaction
          unifiedPersistenceManager.rollbackTransaction()
            .catch(rollbackError => {
              console.error(`Flashcard app [${new Date().toISOString()}]: Error rolling back transaction:`, rollbackError);
            })
            .finally(() => {
              // Fall back to legacy method
              console.log(`Flashcard app [${new Date().toISOString()}]: Falling back to legacy method for creating topic shells`);
              legacyCreateTopicShellsFromLists(topicLists, recordId);
            });
        });
    } else {
      // Use legacy method if TopicShellManager not available
      legacyCreateTopicShellsFromLists(topicLists, recordId);
    }
  } catch (error) {
    console.error(`Flashcard app [${new Date().toISOString()}]: Error in createTopicShellsFromLists:`, error);
    
    // Fall back to legacy method
    legacyCreateTopicShellsFromLists(topicLists, recordId);
  }
}

// Legacy createTopicShellsFromLists function (original implementation)
function legacyCreateTopicShellsFromLists(topicLists, recordId) {
  // Your original createTopicShellsFromLists implementation here
  try {
    if (!Array.isArray(topicLists) || topicLists.length === 0) {
      console.log(`Flashcard app [${new Date().toISOString()}]: No topic lists to create shells from`);
      return;
    }
    
    // Rest of your original implementation...
    // [Keep your existing code here]
  } catch (error) {
    // [Keep your existing error handling]
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

  // Try to use UnifiedPersistenceManager if available
  if (loadPersistenceServices()) {
    console.log("Flashcard app: Using UnifiedPersistenceManager for saving data");
    
    // Get Auth data from Knack
    const auth = {
      token: Knack.getUserToken(),
      userId: userId,
      email: window.currentKnackUser?.email,
      name: window.currentKnackUser?.name
    };
    
    // Start a transaction
    unifiedPersistenceManager.beginTransaction();
    
    // Process each part of the data
    let promises = [];
    
    // Save cards if present
    if (data.cards && Array.isArray(data.cards)) {
      promises.push(unifiedPersistenceManager.saveCards(data.cards));
    }
    
    // Save topic shells if present (from topic lists)
    if (data.topicLists && Array.isArray(data.topicLists)) {
      // Extract topics from topic lists
      const topics = [];
      data.topicLists.forEach(list => {
        if (list.topics && Array.isArray(list.topics)) {
          list.topics.forEach(topic => {
            topics.push({
              id: topic.id,
              name: topic.name || topic.topic,
              subject: list.subject,
              examBoard: list.examBoard,
              examType: list.examType,
              color: topic.color
            });
          });
        }
      });
      
      // Save extracted topics as topic shells
      if (topics.length > 0) {
        promises.push(unifiedPersistenceManager.saveTopics(topics));
      }
      
      // Save topic lists themselves
      promises.push(
        unifiedPersistenceManager.addTransactionOperation({
          type: 'saveTopicLists',
          data: data.topicLists
        })
      );
    }
    
    // Save color mapping if present
    if (data.colorMapping) {
      promises.push(
        unifiedPersistenceManager.addTransactionOperation({
          type: 'updateColorMapping',
          data: data.colorMapping
        })
      );
    }
    
    // Save metadata if present
    if (data.topicMetadata && Array.isArray(data.topicMetadata)) {
      promises.push(unifiedPersistenceManager.saveTopicMetadata(data.topicMetadata));
    }
    
    // Commit the transaction after all operations are added
    Promise.all(promises)
      .then(() => {
        return unifiedPersistenceManager.commitTransaction();
      })
      .then(() => {
        console.log("Flashcard app: Successfully saved user data with UnifiedPersistenceManager");
        callback(true);
      })
      .catch(error => {
        console.error("Flashcard app: Error saving user data with UnifiedPersistenceManager:", error);
        
        // Roll back the transaction
        unifiedPersistenceManager.rollbackTransaction()
          .catch(rollbackError => {
            console.error("Flashcard app: Error rolling back transaction:", rollbackError);
          })
          .finally(() => {
            // Fall back to legacy saving method
            console.log("Flashcard app: Falling back to legacy saving method");
            legacySaveFlashcardUserData(userId, data, callback);
          });
      });
  } else {
    // Use legacy method if UnifiedPersistenceManager not available
    legacySaveFlashcardUserData(userId, data, callback);
  }
}

// Legacy save function (original implementation)
function legacySaveFlashcardUserData(userId, data, callback) {
  console.log("Flashcard app: Saving flashcard data with legacy method for:", userId);
  
  // Original saveFlashcardUserData implementation
  // Your original code here...
  
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

  // Rest of your original implementation...
  // [Keep your existing code here]
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
    
    // Try to use UnifiedPersistenceManager if available
    if (loadPersistenceServices()) {
      console.log("Flashcard app: Using UnifiedPersistenceManager for adding cards to bank");
      
      // Start a transaction
      unifiedPersistenceManager.beginTransaction();
      
      // Use the transaction-based card saving
      unifiedPersistenceManager.saveCardsWithTransaction(newCards)
        .then(() => {
          return unifiedPersistenceManager.commitTransaction();
        })
        .then(() => {
          console.log(`Flashcard app [${new Date().toISOString()}]: Successfully added ${newCards.length} cards to bank with UnifiedPersistenceManager`);
          
          // Reset the save in progress flag
          saveInProgress = false;
          
          // Handle queued operations
          if (saveQueued) {
            saveQueued = false;
            // Schedule another operation
            setTimeout(() => {
              if (typeof callback === 'function') {
                callback({
                  success: true,
                  shouldReload: true,
                  message: "Cards added successfully, processing queued operations"
                });
              }
              handleSaveData(data);
            }, 500);
          } else {
            if (typeof callback === 'function') {
              callback({
                success: true,
                shouldReload: true,
                message: "Cards added successfully"
              });
            }
          }
        })
        .catch(error => {
          console.error("Flashcard app: Error adding cards to bank with UnifiedPersistenceManager:", error);
          
          // Roll back the transaction
          unifiedPersistenceManager.rollbackTransaction()
            .catch(rollbackError => {
              console.error("Flashcard app: Error rolling back transaction:", rollbackError);
            })
            .finally(() => {
              // Reset the save in progress flag
              saveInProgress = false;
              
              // Fall back to legacy method
              console.log("Flashcard app: Falling back to legacy method for adding cards to bank");
              legacyHandleAddToBank(data, callback);
            });
        });
    } else {
      // Use legacy method if UnifiedPersistenceManager not available
      legacyHandleAddToBank(data, callback);
    }
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

// Legacy handleAddToBank function (original implementation)
function legacyHandleAddToBank(data, callback) {
  // Your original handleAddToBank implementation here
  try {
    // Extract the necessary info from the data
    const user = window.currentKnackUser || {};
    const userId = user.id;
    const recordId = data.recordId;
    const newCards = data.cards || [];
    
    // Rest of your original implementation...
    // [Keep your existing code here]
  } catch (error) {
    // [Keep your existing error handling]
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
  
  // Existing save logic
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

// Convert existing save functions to use Promises
function actualSaveFunction(data) {
  return new Promise((resolve, reject) => {
    const userId = window.currentKnackUser?.id;
    
    if (!userId) {
      console.error("Cannot save - missing user ID");
      reject(new Error("Missing user ID"));
      return;
    }
    
    // Handle different save types
    if (data.preserveFields === true) {
      handlePreserveFieldsDataSave(userId, data, (success) => {
        if (success) {
          resolve(true);
        } else {
          reject(new Error("Save failed"));
        }
      });
    } else {
      saveFlashcardUserData(userId, data, (success) => {
        if (success) {
          resolve(true);
        } else {
          reject(new Error("Save failed"));
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

// Function to notify the React app about save status
function notifySaveStatus(status, recordId) {
  const iframe = document.getElementById('flashcard-app-iframe');
  if (iframe && iframe.contentWindow) {
    iframe.contentWindow.postMessage({
      type: 'SAVE_STATUS',
      status: status, // 'started', 'completed', 'failed'
      recordId: recordId,
      timestamp: new Date().toISOString()
    }, '*');
  }
}

// Import our persistence services
let unifiedPersistenceManager, topicShellManager, metadataManager, colorManager, dataOperationQueue;

// Function to load the persistence services
function loadPersistenceServices() {
  try {
    // Check if services are already available in window object (set by React app)
    if (window.unifiedPersistenceManager) {
      unifiedPersistenceManager = window.unifiedPersistenceManager;
      console.log("Flashcard app: Using UnifiedPersistenceManager from window object");
    }
    
    if (window.topicShellManager) {
      topicShellManager = window.topicShellManager;
    }
    
    if (window.metadataManager) {
      metadataManager = window.metadataManager;
    }
    
    if (window.colorManager) {
      colorManager = window.colorManager;
    }
    
    if (window.dataOperationQueue) {
      dataOperationQueue = window.dataOperationQueue;
    }
    
    // Return true if the main service is available
    return !!unifiedPersistenceManager;
  } catch (error) {
    console.error("Flashcard app: Error loading persistence services:", error);
    return false;
  }
}

// In your React app, after initializing the persistence services
if (window.parent) {
  window.parent.postMessage({
    type: 'PERSISTENCE_SERVICES_READY',
    services: {
      unifiedPersistenceManager,
      topicShellManager,
      metadataManager, 
      colorManager,
      dataOperationQueue
    }
  }, '*');
}
})();
