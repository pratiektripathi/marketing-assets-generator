/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Modality } from '@google/genai';
import JSZip from 'jszip';

// Helper function to convert file to base64 using canvas fallback
const fileToGenerativePart = async (file: File, imagePreviewUrl?: string) => {
  // Validate file before processing
  if (!file || file.size === 0) {
    throw new Error('Invalid file: file is empty or corrupted');
  }

  // Method 1: Try standard FileReader first
  try {
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          const base64 = reader.result.split(',')[1];
          if (base64) resolve(base64);
          else reject(new Error('No base64 data found'));
        } else {
          reject(new Error('FileReader result is not a string'));
        }
      };
      reader.onerror = () => reject(new Error('FileReader error'));
      reader.readAsDataURL(file);
    });
    
    return {
      inlineData: { 
        data: base64, 
        mimeType: file.type || 'image/png' 
      },
    };
  } catch (error) {
    // Continue to next method
  }

  // Method 2: Use canvas to convert image preview to base64
  if (imagePreviewUrl) {
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            if (!ctx) {
              reject(new Error('Could not get canvas context'));
              return;
            }
            
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            
            const dataUrl = canvas.toDataURL(file.type || 'image/png');
            const base64 = dataUrl.split(',')[1];
            
            if (base64) {
              resolve(base64);
            } else {
              reject(new Error('Canvas conversion failed'));
            }
          } catch (err) {
            reject(new Error(`Canvas error: ${err}`));
          }
        };
        
        img.onerror = () => reject(new Error('Image load error'));
        img.src = imagePreviewUrl;
      });
      
      return {
        inlineData: { 
          data: base64, 
          mimeType: file.type || 'image/png' 
        },
      };
    } catch (error) {
      // Continue to next method
    }
  }

  // Method 3: Try ArrayBuffer as last resort
  try {
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const arrayBuffer = reader.result as ArrayBuffer;
          const uint8Array = new Uint8Array(arrayBuffer);
          const binaryString = Array.from(uint8Array).map(byte => String.fromCharCode(byte)).join('');
          const base64 = btoa(binaryString);
          resolve(base64);
        } catch (err) {
          reject(new Error('ArrayBuffer conversion failed'));
        }
      };
      reader.onerror = () => reject(new Error('ArrayBuffer read error'));
      reader.readAsArrayBuffer(file);
    });
    
    return {
      inlineData: { 
        data: base64, 
        mimeType: file.type || 'image/png' 
      },
    };
  } catch (error) {
    // All methods failed
  }

  throw new Error('All methods failed to read file. Please try uploading the file directly instead of pasting.');
};

const FallingBananas: React.FC = () => {
  const bananas = useMemo(() => {
    // Generate a memoized array of banana styles to prevent re-calculation on re-renders
    return Array.from({ length: 30 }).map((_, i) => ({
      id: i,
      style: {
        left: `${Math.random() * 100}vw`,
        transform: `scale(${0.8 + Math.random() * 0.5})`, // for size variation
        animationDuration: `${5 + Math.random() * 8}s`, // Slower and varied falling speed
        animationDelay: `${Math.random() * 7}s`, // Staggered start times
      },
    }));
  }, []);

  return (
    <div className="falling-bananas-container" aria-hidden="true">
      {bananas.map(banana => (
        <div key={banana.id} className="banana" style={banana.style}></div>
      ))}
    </div>
  );
};

type AssetState = {
  title: string;
  url: string | null;
  status: 'pending' | 'success' | 'error';
  error?: string;
};

const App: React.FC = () => {
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [prompt, setPrompt] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [result, setResult] = useState<AssetState[]>([]);
  const [generationStarted, setGenerationStarted] = useState<boolean>(false);
  const isGenerationCancelled = useRef(false);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImage(file);
      setImagePreview(URL.createObjectURL(file));
      setResult([]);
      setError('');
    }
  };

  useEffect(() => {
    const handlePaste = async (event: ClipboardEvent) => {
      const clipboardData = event.clipboardData;
      if (!clipboardData) return;

      // Check if the paste is happening in the textarea
      const target = event.target as HTMLElement;
      const isTextarea = target.tagName === 'TEXTAREA' || target.id === 'prompt-input';
      
      // Check if there's an image in the clipboard
      const hasImage = clipboardData.files[0]?.type.startsWith('image/') || 
                      Array.from(clipboardData.items).some(item => item.type.startsWith('image/'));

      // If pasting image in textarea, prevent it and show message
      if (hasImage && isTextarea) {
        event.preventDefault();
        setError('Images cannot be pasted in the text field. Please paste images in the upload area above.');
        return;
      }

      // Only handle image pasting if:
      // 1. There's an image in clipboard AND
      // 2. The paste is NOT happening in the textarea
      if (hasImage && !isTextarea) {
        event.preventDefault();
        
        try {
          let imageFile: File | null = null;
          
          // Method 1: Try direct file access (like ChatGPT)
          const directFile = clipboardData.files[0];
          if (directFile && directFile.type.startsWith('image/')) {
            console.log('Method 1: Direct file access');
            imageFile = new File([directFile], directFile.name, { type: directFile.type });
          }
          
          // Method 2: Try clipboard items (like WhatsApp/Cursor)
          if (!imageFile) {
            console.log('Method 2: Clipboard items access');
            const items = Array.from(clipboardData.items);
            for (const item of items) {
              if (item.type.startsWith('image/')) {
                const blob = item.getAsFile();
                if (blob) {
                  const extension = item.type.split('/')[1] || 'png';
                  imageFile = new File([blob], `pasted-image-${Date.now()}.${extension}`, { type: item.type });
                  break;
                }
              }
            }
          }
          
          // Method 3: Try reading as ArrayBuffer (like Cursor)
          if (!imageFile) {
            console.log('Method 3: ArrayBuffer conversion');
            const items = Array.from(clipboardData.items);
            for (const item of items) {
              if (item.type.startsWith('image/')) {
                try {
                  const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result as ArrayBuffer);
                    reader.onerror = () => reject(new Error('Failed to read as ArrayBuffer'));
                    reader.readAsArrayBuffer(item.getAsFile()!);
                  });
                  
                  const extension = item.type.split('/')[1] || 'png';
                  imageFile = new File([arrayBuffer], `pasted-image-${Date.now()}.${extension}`, { type: item.type });
                  break;
                } catch (err) {
                  console.warn('ArrayBuffer method failed:', err);
                }
              }
            }
          }
          
          if (imageFile) {
            // Validate file
            if (imageFile.size > 10 * 1024 * 1024) {
              setError('Image too large. Please use an image smaller than 10MB.');
              return;
            }
            
            const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
            if (!validTypes.includes(imageFile.type)) {
              setError('Unsupported image format. Please use JPEG, PNG, WebP, or GIF.');
              return;
            }
            
            console.log('Successfully created image file:', {
              name: imageFile.name,
              type: imageFile.type,
              size: imageFile.size
            });
            
            setImage(imageFile);
            setImagePreview(URL.createObjectURL(imageFile));
            setResult([]);
            setError('');
          } else {
            setError('Could not extract image from clipboard. Please try uploading the file directly.');
          }
        } catch (error) {
          console.error('Error processing pasted image:', error);
          setError('Failed to process pasted image. Please try uploading the file directly.');
        }
      }
      // If pasting text in textarea, let default behavior handle it
    };

    window.addEventListener('paste', handlePaste);

    return () => {
      window.removeEventListener('paste', handlePaste);
    };
  }, []);

  const generateAssets = useCallback(async () => {
    if (!image || !prompt) {
      setError('Please provide both an image and a description.');
      return;
    }
  
    setGenerationStarted(true);
    setIsLoading(true);
    setError('');
    setResult([]);
    isGenerationCancelled.current = false;
  
    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) {
        setError('API key not found. Please set VITE_GEMINI_API_KEY in your environment variables or create a .env file with VITE_GEMINI_API_KEY=your_api_key_here');
        return;
      }
      const ai = new GoogleGenAI({ apiKey });
      
      // Validate image before processing
      if (!image || image.size === 0) {
        setError('Invalid image. Please try uploading or pasting a valid image.');
        return;
      }
      
      const imagePart = await fileToGenerativePart(image, imagePreview);
      console.log('Image part prepared for Gemini:', imagePart);

      // --- New Step 1: Generate Avatar Description ---
      let avatarDescription = '';
      try {
        const avatarGenPrompt = `Based on the following product and its key features: "${prompt}", describe a single, visually distinct and appealing brand avatar or mascot in one sentence. This avatar will be used in marketing images. Be specific about its appearance (e.g., age, gender, style for a person; species, color, expression for an animal or character). The description should be concise and ready to be used in an image generation prompt. For example, for 'A stylish, eco-friendly water bottle', a good description would be 'A young, athletic woman with a friendly smile, in her mid-20s, wearing modern activewear.' Do not add any preamble.`;
        
        console.log('Sending request to Gemini for avatar description...');
        const avatarResponse = await ai.models.generateContent({
          model: 'gemini-2.5-flash-image-preview',
          contents: {
            parts: [imagePart, { text: avatarGenPrompt }],
          },
          config: {
            responseModalities: [Modality.TEXT],
          },
        });
        console.log('Avatar response received:', avatarResponse);
        avatarDescription = avatarResponse.text.trim();

      } catch (err) {
        console.warn('Could not generate avatar description, proceeding without avatar assets.', err);
      }
  
      const creativeAssets = [
        {
          title: 'Lifestyle Photo',
          prompt: `Create a super high-resolution, photorealistic lifestyle photo from a front view. It should feature a character happily using a product with the following description: "${prompt}". The setting should be bright and inviting, reflecting the product's use case. Emphasize crisp details and professional lighting.`,
        },
        {
          title: 'Action Shot',
          prompt: `Generate a dynamic, super high-resolution, close-up action shot of a product being used. The product is: "${prompt}". The image should focus on the product in action, highlighting its key features in a real-world scenario with extreme detail and clarity.`,
        },
        {
          title: 'Advertising Pamphlet',
          prompt: `Design a modern, visually appealing advertising pamphlet for this product: "${prompt}". The image must be super high-resolution to ensure text and graphics are sharp. It should show both the front and back sides of the pamphlet laid out flat, side-by-side. The design should be clean, professional, and incorporate key features from the description into the visual layout.`,
        },
        {
          title: 'Product Shot (White BG)',
          prompt: `Design a clean, professional, super high-resolution product-only image on a white background. The product is described as: "${prompt}". The image should visually highlight the key features mentioned in the description with photorealistic detail, perhaps using subtle callouts or by emphasizing those aspects of the product.`,
        },
        {
          title: 'Multi-Angle View',
          prompt: `Create a composite image showing the product from three different viewpoints (front, side, and angled) on a seamless white background. The final image must be super high-resolution. The product is: "${prompt}". This should look like a professional product listing image with sharp focus and perfect lighting.`,
        },
        {
          title: 'Website Banner',
          prompt: `Design a wide banner image with a 16:9 aspect ratio, specifically at a super high resolution like 3840x2160 pixels, suitable for a website's hero section. This banner should be visually striking and include a catchy sales pitch for a product described as: "${prompt}". The imagery should dramatically showcase the product's most extreme features in photorealistic detail.`,
        },
        {
          title: 'Social Media Post',
          prompt: `Create an eye-catching, super high-resolution social media post for platforms like Instagram. The product is: "${prompt}". The image should be square, vibrant, and designed to grab attention in a busy feed, possibly with a human element or a creative background. Ensure the image is extremely sharp and detailed.`,
        },
      ];

      if (avatarDescription) {
        const avatarAssets = [
          {
            title: 'Avatar with Product',
            prompt: `Create a super high-resolution, photorealistic lifestyle photo. It should feature an avatar described as: "${avatarDescription}", happily using the product from the provided image, which is "${prompt}". The setting should be bright and contextually appropriate, reflecting the product's use case. Emphasize crisp details and professional lighting.`,
          },
          {
            title: 'Avatar Showcase',
            prompt: `Generate a dynamic, super high-resolution action shot. The avatar, described as: "${avatarDescription}", is enthusiastically showcasing a key feature of the product from the image ("${prompt}"). The image should focus on the interaction, capturing a moment of genuine use with extreme detail and clarity.`,
          },
          {
            title: 'Avatar Testimonial Pose',
            prompt: `Create a realistic, super high-resolution image perfect for a social media testimonial. It shows the avatar, described as: "${avatarDescription}", looking directly at the camera with a delighted expression while holding or presenting the product: "${prompt}". The background should be clean and slightly blurred to make the avatar and product the main focus. Generate a complete, detailed image with proper lighting and composition.`,
          },
          {
            title: 'Avatar Unboxing Experience',
            prompt: `Generate a super high-resolution, photorealistic image of the avatar described as: "${avatarDescription}", with a look of excitement while unboxing the product: "${prompt}". The packaging should be partially open, revealing the product inside. The setting should be a clean, well-lit space like a modern living room or studio. Create a complete, detailed image showing the avatar's facial expression, the product packaging, and the unboxing moment.`,
          },
          {
            title: 'Avatar in Context',
            prompt: `Create a super high-resolution, photorealistic lifestyle image featuring the avatar described as: "${avatarDescription}", actively using the product: "${prompt}" in a realistic, natural setting. The image must show the avatar in action with the product, in an appropriate environment that matches the product's use case. The scene should be well-lit, professional, and showcase both the avatar and product clearly. Generate a complete, detailed image with proper composition and lighting.`,
          },
          {
            title: 'Avatar Product Close-Up',
            prompt: `Create a super high-resolution, detailed close-up image focusing on the avatar's hands, described as belonging to: "${avatarDescription}", as they interact with a specific feature of the product: "${prompt}". The image should emphasize the product's texture, materials, and design, conveying a sense of quality and usability. Generate a complete, detailed image showing the hands, product interaction, and fine details.`,
          },
        ];
        creativeAssets.push(...avatarAssets);
      }

      // Immediately set all assets to pending to show placeholders
      setResult(
        creativeAssets.map((asset) => ({
          title: asset.title,
          url: null,
          status: 'pending',
        }))
      );
  
      const generationPromises = creativeAssets.map((asset) => {
        console.log(`Generating asset: ${asset.title}`);
        return ai.models.generateContent({
          model: 'gemini-2.5-flash-image-preview',
          contents: {
            parts: [imagePart, { text: asset.prompt }],
          },
          config: {
            responseModalities: [Modality.IMAGE, Modality.TEXT],
          },
        })
        .then((response) => {
          if (isGenerationCancelled.current) return;
  
          const imagePartResponse = response.candidates?.[0]?.content.parts.find(
            (part) => part.inlineData
          );
  
          if (imagePartResponse?.inlineData) {
            const imageUrl = `data:${imagePartResponse.inlineData.mimeType};base64,${imagePartResponse.inlineData.data}`;
            // Update the specific asset to success
            setResult((prev) =>
              prev.map((item) =>
                item.title === asset.title
                  ? { ...item, url: imageUrl, status: 'success' }
                  : item
              )
            );
          } else {
            // Handle case where API returns success but no image data
            throw new Error('No image data found in API response.');
          }
        })
        .catch((err) => {
          if (isGenerationCancelled.current) return;
          console.error(`Asset generation for "${asset.title}" failed:`, err);
          console.error('Error details:', {
            message: err.message,
            status: err.status,
            code: err.code,
            details: err.details
          });
          // Update the specific asset to error
          setResult((prev) =>
            prev.map((item) =>
              item.title === asset.title
                ? {
                    ...item,
                    status: 'error',
                    error: err instanceof Error ? err.message : 'Generation failed',
                  }
                : item
            )
          );
        });
      });
  
      // Wait for all promises to settle before turning off the main loader
      await Promise.allSettled(generationPromises);
  
    } catch (err) {
      console.error(err);
      setError(
        `An error occurred: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    } finally {
      setIsLoading(false);
    }
  }, [image, prompt]);

  const handleDownloadAll = async () => {
    const successfulResults = result.filter(r => r.status === 'success' && r.url);
    if (successfulResults.length === 0) return;

    const zip = new JSZip();

    successfulResults.forEach(({ title, url }) => {
      const fileName = `${title!.toLowerCase().replace(/[^a-z0-9]/g, '-')}-asset.png`;
      const base64Data = url!.split(',')[1];
      zip.file(fileName, base64Data, { base64: true });
    });

    const content = await zip.generateAsync({ type: 'blob' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = 'marketing-assets.zip';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  };

  const handleStop = () => {
    isGenerationCancelled.current = true;
    setIsLoading(false);
  };
  
  const handleClear = () => {
    setImage(null);
    setImagePreview('');
    setPrompt('');
    setResult([]);
    setError('');
    setIsLoading(false);
    setGenerationStarted(false);
    if(isGenerationCancelled.current) {
      isGenerationCancelled.current = false;
    }
  };

  return (
    <div className="container">
      {isLoading && <FallingBananas />}
      <header>
        <h1>Marketing Asset Generator</h1>
        <p>Upload a product photo, describe your goal, and let AI create new assets.</p>
      </header>

      <main>
        <div className="card">
          <div className="form-section">
            <div className="input-group">
              <label htmlFor="image-upload">1. Upload Product Photo</label>
              <input
                id="image-upload"
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                style={{ display: 'none' }}
              />
              <label htmlFor="image-upload" className="image-upload-area" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && document.getElementById('image-upload')?.click()}>
                Click, drag & drop, or <span>paste an image</span>.
              </label>
              {imagePreview && (
                <div className="image-preview">
                  <div className="image-preview-container">
                    <img src={imagePreview} alt="Selected product" />
                    <button
                      className="delete-image-btn"
                      onClick={() => {
                        setImage(null);
                        setImagePreview('');
                        setResult([]);
                        setError('');
                        // Clear the file input
                        const fileInput = document.getElementById('image-upload') as HTMLInputElement;
                        if (fileInput) fileInput.value = '';
                      }}
                      title="Remove image"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )}
            </div>
            
            <div className="input-group">
              <label htmlFor="prompt-input">2. Describe Your Product & Key Features</label>
              <textarea
                id="prompt-input"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g., 'A stylish, eco-friendly water bottle that keeps drinks cold for 24 hours. Made from stainless steel.'"
              />
            </div>

            <div className="button-group">
              {isLoading ? (
                <button className="btn btn-danger" onClick={handleStop}>Stop</button>
              ) : (
                <>
                  <button
                    className="btn"
                    onClick={generateAssets}
                    disabled={!image || !prompt}
                  >
                    Generate Assets
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={handleClear}
                    disabled={!image && !prompt && result.length === 0}
                  >
                    Clear
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {generationStarted && (
          <div className="card results-section">
            {isLoading && result.length === 0 && (
              <div className="initial-loader">
                <div className="spinner"></div>
                <p>Generating creative concepts...</p>
              </div>
            )}
            {error && <div className="error-message" role="alert">{error}</div>}
            {result.length > 0 && (
              <>
                <div className="results-header">
                  <h2>Generated Assets</h2>
                  <button 
                    className="btn download-all-btn" 
                    onClick={handleDownloadAll}
                    disabled={!result.some(r => r.status === 'success')}
                  >
                    Download All (.zip)
                  </button>
                </div>
                <div className="result-content">
                  {result.map((item, index) => (
                    <div className="result-item" key={index}>
                      <h3>{item.title}</h3>
                      {item.status === 'pending' && (
                        <div className="placeholder wireframe">
                          <div className="skeleton skeleton-title"></div>
                          <div className="skeleton skeleton-image"></div>
                          <div className="skeleton skeleton-button"></div>
                        </div>
                      )}
                      {item.status === 'success' && item.url && (
                        <>
                          <img src={item.url} alt={`Generated marketing asset: ${item.title}`}/>
                          <a 
                            className="btn download-btn"
                            href={item.url}
                            download={`${item.title.toLowerCase().replace(/[^a-z0-9]/g, '-')}-asset.png`}
                          >
                            Download Image
                          </a>
                        </>
                      )}
                      {item.status === 'error' && (
                         <div className="placeholder error-placeholder">
                            <p role="img" aria-label="Warning">⚠️</p>
                            <span>Failed to generate</span>
                            {item.error && <small>{item.error}</small>}
                         </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);