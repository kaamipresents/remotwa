using System;
using System.Collections.Concurrent;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using Windows.Storage.Streams;

namespace Remotva.Companion.Media;

public class AlbumArtCache
{
    private readonly ConcurrentDictionary<string, byte[]> _cache = new();

    public static string ComputeTrackId(string title, string artist)
    {
        string raw = $"{title.Trim()}|||{artist.Trim()}";
        byte[] bytes = SHA256.HashData(Encoding.UTF8.GetBytes(raw));
        return Convert.ToHexString(bytes)[..16].ToLowerInvariant();
    }

    public async Task<string?> ProcessAndCacheArtAsync(string trackId, IRandomAccessStreamReference? thumbnailRef)
    {
        if (thumbnailRef == null) return null;
        if (_cache.ContainsKey(trackId)) return trackId;

        try
        {
            using var stream = await thumbnailRef.OpenReadAsync();
            using var netStream = stream.AsStreamForRead();
            using var originalImage = Image.FromStream(netStream);

            // Resize to 300x300 while maintaining aspect ratio or centering
            using var resizedImage = ResizeImage(originalImage, 300, 300);

            // Encode to JPEG at 80% quality
            using var ms = new MemoryStream();
            var encoder = GetEncoder(ImageFormat.Jpeg);
            using var encoderParameters = new EncoderParameters(1);
            encoderParameters.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, 80L);

            if (encoder != null)
            {
                resizedImage.Save(ms, encoder, encoderParameters);
            }
            else
            {
                resizedImage.Save(ms, ImageFormat.Jpeg);
            }

            byte[] jpegBytes = ms.ToArray();
            _cache[trackId] = jpegBytes;
            return trackId;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[AlbumArtCache] Error processing art: {ex.Message}");
            return null;
        }
    }

    public byte[]? GetCachedArt(string trackId, int maxSize = 300)
    {
        if (!_cache.TryGetValue(trackId, out byte[]? cachedBytes))
        {
            return null;
        }

        if (maxSize < 300)
        {
            // For BLE (e.g. 96x96), resize down dynamically
            try
            {
                using var ms = new MemoryStream(cachedBytes);
                using var image = Image.FromStream(ms);
                using var smallImage = ResizeImage(image, maxSize, maxSize);
                using var outMs = new MemoryStream();
                var encoder = GetEncoder(ImageFormat.Jpeg);
                using var encoderParams = new EncoderParameters(1);
                encoderParams.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, 75L);
                smallImage.Save(outMs, encoder ?? ImageCodecInfo.GetImageDecoders()[0], encoderParams);
                return outMs.ToArray();
            }
            catch
            {
                return cachedBytes;
            }
        }

        return cachedBytes;
    }

    private static Bitmap ResizeImage(Image image, int width, int height)
    {
        var destRect = new Rectangle(0, 0, width, height);
        var destImage = new Bitmap(width, height);

        destImage.SetResolution(image.HorizontalResolution, image.VerticalResolution);

        using var graphics = Graphics.FromImage(destImage);
        graphics.CompositingMode = CompositingMode.SourceCopy;
        graphics.CompositingQuality = CompositingQuality.HighQuality;
        graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
        graphics.SmoothingMode = SmoothingMode.HighQuality;
        graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;

        using var wrapMode = new ImageAttributes();
        wrapMode.SetWrapMode(WrapMode.TileFlipXY);
        graphics.DrawImage(image, destRect, 0, 0, image.Width, image.Height, GraphicsUnit.Pixel, wrapMode);

        return destImage;
    }

    private static ImageCodecInfo? GetEncoder(ImageFormat format)
    {
        ImageCodecInfo[] codecs = ImageCodecInfo.GetImageDecoders();
        foreach (ImageCodecInfo codec in codecs)
        {
            if (codec.FormatID == format.Guid)
            {
                return codec;
            }
        }
        return null;
    }
}
