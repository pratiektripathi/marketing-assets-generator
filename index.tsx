/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Modality } from '@google/genai';
import JSZip from 'jszip';

// Helper function to convert file to base64
const fileToGenerativePart = async (file: File) => {
  const base64EncodedDataPromise = new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result.split(',')[1]);
      }
    };
    reader.readAsDataURL(file);
  });
  return {
    inlineData: { data: await base64EncodedDataPromise, mimeType: file.type },
  };
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
    const handlePaste = (event: ClipboardEvent) => {
      const file = event.clipboardData?.files[0];
      if (file && file.type.startsWith('image/')) {
        setImage(file);
        setImagePreview(URL.createObjectURL(file));
        setResult([]);
        setError('');
      }
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
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
      const imagePart = await fileToGenerativePart(image);

      // --- New Step 1: Generate Avatar Description ---
      let avatarDescription = '';
      try {
        const avatarGenPrompt = `Based on the following product and its key features: "${prompt}", describe a single, visually distinct and appealing brand avatar or mascot in one sentence. This avatar will be used in marketing images. Be specific about its appearance (e.g., age, gender, style for a person; species, color, expression for an animal or character). The description should be concise and ready to be used in an image generation prompt. For example, for 'A stylish, eco-friendly water bottle', a good description would be 'A young, athletic woman with a friendly smile, in her mid-20s, wearing modern activewear.' Do not add any preamble.`;
        
        const avatarResponse = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: avatarGenPrompt,
        });
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
            prompt: `Design a realistic, super high-resolution image perfect for a social media testimonial. It shows the avatar, described as: "${avatarDescription}", looking directly at the camera with a delighted expression while holding or presenting the product ("${prompt}"). The background should be clean and slightly blurred to make the avatar and product the main focus.`,
          },
          {
            title: 'Avatar Unboxing Experience',
            prompt: `Create a super high-resolution, photorealistic shot of the avatar, described as: "${avatarDescription}", with a look of excitement while unboxing the product ("${prompt}"). The packaging should be partially open, revealing the product inside. The setting should be a clean, well-lit space like a modern living room or studio.`,
          },
          {
            title: 'Avatar in Context',
            prompt: `Generate a super high-resolution, photorealistic image of the avatar, described as: "${avatarDescription}", using the product ("${prompt}") in its natural environment. For example, if it's a water bottle, show them on a hiking trail; if it's a tech gadget, in a modern office. The background should be scenic and relevant, enhancing the product's story.`,
          },
          {
            title: 'Avatar Product Close-Up',
            prompt: `Design a super high-resolution, detailed close-up shot focusing on the avatar's hands, described as belonging to: "${avatarDescription}", as they interact with a specific feature of the product ("${prompt}"). The image should emphasize the product's texture, materials, and design, conveying a sense of quality and usability.`,
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
  
      const generationPromises = creativeAssets.map((asset) =>
        ai.models.generateContent({
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
        })
      );
  
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
                  <img src={imagePreview} alt="Selected product" />
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