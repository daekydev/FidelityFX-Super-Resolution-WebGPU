import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=[
                '--enable-unsafe-webgpu',
                '--disable-dawn-features=disallow_unsafe_apis',
                '--use-vulkan=native',
                '--use-angle=vulkan',
                '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan,WebGPU',
                '--disable-gpu-sandbox'
            ]
        )
        page = await browser.new_page()
        page.on("console", lambda msg: print(f"Browser console: {msg.type} - {msg.text}"))
        page.on("pageerror", lambda err: print(f"Browser error: {err}"))
        await page.goto("http://localhost:5173")
        await page.wait_for_timeout(3000)
        await page.screenshot(path="verification.png")
        print("Screenshot taken.")
        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
