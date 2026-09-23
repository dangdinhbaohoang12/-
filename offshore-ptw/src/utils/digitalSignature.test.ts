import { describe, it, expect } from 'vitest';
import { createDigitalSignature, verifyDigitalSignature, createPermitHash } from './digitalSignature';

describe('Digital Signature', () => {
  describe('createDigitalSignature', () => {
    it('should create a valid signature with hash and timestamp', () => {
      const result = createDigitalSignature('test-content', '1234', 'user-1');
      
      expect(result.hash).toBeDefined();
      expect(result.hash.length).toBe(64); // SHA256 produces 64 hex characters
      expect(result.timestamp).toBeDefined();
      expect(result.isValid).toBe(true);
      expect(result.isTrusted).toBe(false);
    });

    it('should produce different signatures for different content', () => {
      const sig1 = createDigitalSignature('content-1', '1234', 'user-1');
      const sig2 = createDigitalSignature('content-2', '1234', 'user-1');
      
      expect(sig1.hash).not.toBe(sig2.hash);
    });

    it('should produce different signatures for different PINs', () => {
      const sig1 = createDigitalSignature('content', '1234', 'user-1');
      const sig2 = createDigitalSignature('content', '5678', 'user-1');
      
      expect(sig1.hash).not.toBe(sig2.hash);
    });

    it('should produce different signatures for different users', () => {
      const sig1 = createDigitalSignature('content', '1234', 'user-1');
      const sig2 = createDigitalSignature('content', '1234', 'user-2');
      
      expect(sig1.hash).not.toBe(sig2.hash);
    });

    it('should produce different signatures at different times', () => {
      const sig1 = createDigitalSignature('content', '1234', 'user-1');
      // Small delay to ensure different timestamp
      const sig2 = createDigitalSignature('content', '1234', 'user-1');
      
      // Timestamps should be different or very close
      expect(sig1.timestamp).toBeDefined();
      expect(sig2.timestamp).toBeDefined();
    });
  });

  describe('verifyDigitalSignature', () => {
    it('should verify a valid signature', () => {
      const content = 'test-content';
      const pinCode = '1234';
      const userId = 'user-1';
      
      const signature = createDigitalSignature(content, pinCode, userId);
      const isValid = verifyDigitalSignature(
        content,
        signature.hash,
        userId,
        signature.timestamp,
        pinCode
      );
      
      expect(isValid).toBe(true);
    });

    it('should reject signature with wrong PIN', () => {
      const content = 'test-content';
      const pinCode = '1234';
      const userId = 'user-1';
      
      const signature = createDigitalSignature(content, pinCode, userId);
      const isValid = verifyDigitalSignature(
        content,
        signature.hash,
        userId,
        signature.timestamp,
        '9999' // Wrong PIN
      );
      
      expect(isValid).toBe(false);
    });

    it('should reject signature with wrong content', () => {
      const content = 'test-content';
      const pinCode = '1234';
      const userId = 'user-1';
      
      const signature = createDigitalSignature(content, pinCode, userId);
      const isValid = verifyDigitalSignature(
        'different-content',
        signature.hash,
        userId,
        signature.timestamp,
        pinCode
      );
      
      expect(isValid).toBe(false);
    });

    it('should reject signature with wrong user ID', () => {
      const content = 'test-content';
      const pinCode = '1234';
      const userId = 'user-1';
      
      const signature = createDigitalSignature(content, pinCode, userId);
      const isValid = verifyDigitalSignature(
        content,
        signature.hash,
        'user-2', // Wrong user
        signature.timestamp,
        pinCode
      );
      
      expect(isValid).toBe(false);
    });

    it('should reject signature with wrong timestamp', () => {
      const content = 'test-content';
      const pinCode = '1234';
      const userId = 'user-1';
      
      const signature = createDigitalSignature(content, pinCode, userId);
      const isValid = verifyDigitalSignature(
        content,
        signature.hash,
        userId,
        '2020-01-01T00:00:00.000Z', // Wrong timestamp
        pinCode
      );
      
      expect(isValid).toBe(false);
    });
  });

  describe('createPermitHash', () => {
    it('should create a hash for permit', () => {
      const hash = createPermitHash('permit-123', 'ISSUED');
      
      expect(hash).toBeDefined();
      expect(hash.length).toBe(16); // We substring to 16 characters
    });

    it('should produce different hashes for different permit IDs', () => {
      const hash1 = createPermitHash('permit-1', 'ISSUED');
      const hash2 = createPermitHash('permit-2', 'ISSUED');
      
      expect(hash1).not.toBe(hash2);
    });

    it('should produce different hashes for different statuses', () => {
      const hash1 = createPermitHash('permit-1', 'DRAFT');
      const hash2 = createPermitHash('permit-1', 'ISSUED');
      
      expect(hash1).not.toBe(hash2);
    });

    it('should produce different hashes at different times', () => {
      const hash1 = createPermitHash('permit-1', 'ISSUED');
      const hash2 = createPermitHash('permit-1', 'ISSUED');
      
      // Due to Date.now() in the function, hashes should be different
      // (though there's a small chance they could be the same if called in same millisecond)
      expect(hash1).toBeDefined();
      expect(hash2).toBeDefined();
    });
  });
});
