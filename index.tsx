/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useEffect } from 'react';
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

const App: React.FC = () => {
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [prompt, setPrompt] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [result, setResult] = useState<{ title: string; url: string }[]>([]);

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

    setIsLoading(true);
    setError('');
    setResult([]);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
      const imagePart = await fileToGenerativePart(image);

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

      const generationPromises = creativeAssets.map((asset) => {
        const textPart = { text: asset.prompt };
        const promise = ai.models.generateContent({
          model: 'gemini-2.5-flash-image-preview',
          contents: {
            parts: [imagePart, textPart],
          },
          config: {
            responseModalities: [Modality.IMAGE, Modality.TEXT],
          },
        });
        return { title: asset.title, promise };
      });

      // Update UI as each promise resolves to show results as they come in
      generationPromises.forEach(({ title, promise }) => {
        promise
          .then((response) => {
            if (response.candidates && response.candidates.length > 0) {
              const imagePart = response.candidates[0].content.parts.find(
                (part) => part.inlineData
              );
              if (imagePart?.inlineData) {
                const imageUrl = `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
                setResult((prev) => [...prev, { title, url: imageUrl }]);
              }
            }
          })
          .catch((err) => {
            // Individual errors can be logged; the main error is handled by Promise.all
            console.error(`Asset generation for "${title}" failed:`, err);
          });
      });

      // Wait for all generations to complete to handle loading state and final error message
      const responses = await Promise.all(generationPromises.map((p) => p.promise));

      // Check if any images were successfully generated across all responses
      const hasGeneratedImages = responses.some((response) =>
        response.candidates?.[0]?.content.parts.some((part) => part.inlineData)
      );

      if (!hasGeneratedImages) {
        setError('No images were generated. Please try a different prompt.');
      }
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
    if (result.length === 0) return;

    const zip = new JSZip();

    result.forEach(({ title, url }) => {
      const fileName = `${title.toLowerCase().replace(/[^a-z0-9]/g, '-')}-asset.png`;
      const base64Data = url.split(',')[1];
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

  return (
    <div className="container">
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

            <button
              className="btn"
              onClick={generateAssets}
              disabled={!image || !prompt || isLoading}
            >
              {isLoading ? 'Generating...' : 'Generate Assets'}
            </button>
          </div>
        </div>

        <div className="card results-section">
          {isLoading && <div className="loader" aria-label="Loading content"></div>}
          {error && <div className="error-message" role="alert">{error}</div>}
          {result && result.length > 0 && (
            <>
              <div className="results-header">
                <h2>Generated Assets</h2>
                <button className="btn download-all-btn" onClick={handleDownloadAll}>
                  Download All (.zip)
                </button>
              </div>
              <div className="result-content">
                {result.map(({ title, url }, index) => (
                  <div className="result-item" key={index}>
                    <h3>{title}</h3>
                    <img src={url} alt={`Generated marketing asset: ${title}`}/>
                    <a 
                      className="btn download-btn"
                      href={url}
                      download={`${title.toLowerCase().replace(/[^a-z0-9]/g, '-')}-asset.png`}
                    >
                      Download Image
                    </a>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);