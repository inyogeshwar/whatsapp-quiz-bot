import { decryptPollVote, jidNormalizedUser, getKeyAuthor } from '@whiskeysockets/baileys';
import crypto from 'node:crypto';

/**
 * Decrypts a poll update message received via messages.upsert or messages.update.
 * @param {object} sock - Baileys socket
 * @param {object} msg - The incoming message containing pollUpdateMessage
 * @param {object} originalPoll - The original poll message sent by the bot
 * @returns {object|null} - { voterJid, selectedOptionIndex, selectedOptionName }
 */
export function decryptVoteMessage(sock, msg, originalPoll) {
  try {
    const pollUpdate = msg.message?.pollUpdateMessage || msg.update?.pollUpdates?.[0];
    if (!pollUpdate) return null;

    const pollCreationKey = pollUpdate.pollCreationMessageKey || msg.key;
    if (!pollCreationKey) return null;

    const messageSecret = originalPoll.message?.messageContextInfo?.messageSecret;
    if (!messageSecret) {
      console.warn('❌ No messageSecret found in original poll message');
      return null;
    }

    const pollMsgId = pollCreationKey.id;
    const pollContent = originalPoll.message?.pollCreationMessageV3 ||
                        originalPoll.message?.pollCreationMessageV2 ||
                        originalPoll.message?.pollCreationMessage;

    const options = pollContent?.options || [];
    if (!options.length) {
      console.warn('❌ No options found in original poll message');
      return null;
    }

    const votePayload = pollUpdate.vote;
    if (!votePayload || !votePayload.encPayload || !votePayload.encIv) {
      console.warn('❌ Vote payload missing encPayload or encIv');
      return null;
    }

    // Collect candidate voter JIDs
    const myId = sock.user?.id || '';
    const myNorm = jidNormalizedUser(myId);

    const voterCandidates = [
      msg.key?.participant,
      msg.key?.participantAlt,
      msg.key?.remoteJidAlt,
      msg.key?.remoteJid,
      getKeyAuthor(msg.key, myId)
    ].filter(Boolean);

    const voterList = [];
    for (const v of voterCandidates) {
      if (!voterList.includes(v)) voterList.push(v);
      const norm = jidNormalizedUser(v);
      if (norm && !voterList.includes(norm)) voterList.push(norm);
    }

    // Collect candidate creator JIDs
    const creatorCandidates = [
      myId,
      myNorm,
      originalPoll.key?.participant,
      originalPoll.key?.remoteJid,
      sock.user?.lid
    ].filter(Boolean);

    const creatorList = [];
    for (const c of creatorCandidates) {
      if (!creatorList.includes(c)) creatorList.push(c);
      const norm = jidNormalizedUser(c);
      if (norm && !creatorList.includes(norm)) creatorList.push(norm);
    }

    let decryptedVote = null;
    let successfulVoterJid = null;

    // Try all combinations of creator and voter JIDs
    for (const creatorJid of creatorList) {
      for (const voterJid of voterList) {
        try {
          decryptedVote = decryptPollVote(votePayload, {
            pollEncKey: messageSecret,
            pollMsgId,
            pollCreatorJid: creatorJid,
            voterJid
          });

          if (decryptedVote?.selectedOptions !== undefined) {
            successfulVoterJid = voterJid;
            break;
          }
        } catch (e) {
          // Continue trying next combination
        }
      }
      if (decryptedVote) break;
    }

    if (!decryptedVote || !decryptedVote.selectedOptions || decryptedVote.selectedOptions.length === 0) {
      return null;
    }

    // Hash options to match selectedOption hash
    const selectedBuffer = Buffer.from(decryptedVote.selectedOptions[0]);
    const selectedHashHex = selectedBuffer.toString('hex');

    for (let i = 0; i < options.length; i++) {
      const optName = options[i].optionName || '';
      const optHash = crypto.createHash('sha256').update(optName).digest();

      if (optHash.equals(selectedBuffer) || optHash.toString('hex') === selectedHashHex) {
        const resolvedVoter = successfulVoterJid || jidNormalizedUser(msg.key?.participant || msg.key?.remoteJid);
        return {
          voterJid: resolvedVoter,
          selectedOptionIndex: i,
          selectedOptionName: optName
        };
      }
    }

    return null;
  } catch (error) {
    console.error('❌ Error decrypting vote message:', error.message);
    return null;
  }
}
