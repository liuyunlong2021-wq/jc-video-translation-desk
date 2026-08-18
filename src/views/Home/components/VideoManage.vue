<template>
  <v-sheet class="workspace h-full min-h-0 flex flex-col" border rounded>
    <v-tabs
      v-if="!translationMode"
      :model-value="mediaStore.workspaceView"
      class="workspace-tabs"
      density="compact"
      grow
      @update:model-value="mediaStore.selectView($event)"
    >
      <v-tab value="script">文稿/配音</v-tab>
      <v-tab v-if="mediaStore.approvedScript" value="director">项目总监</v-tab>
      <v-tab value="assets">资产</v-tab>
      <v-tab
        v-if="mediaStore.approvedScript && mediaStore.audioProductionRoute === 'seed-full-track'"
        value="seed-voice"
        @click="openSeedVoice"
        >全局配音</v-tab
      >
      <v-tab value="storyboard">分镜</v-tab>
      <v-tab value="media">分镜图/视频</v-tab>
      <v-tab v-if="mediaStore.allVideosReady" value="dubbing">配音字幕</v-tab>
      <v-tab value="final">成片</v-tab>
    </v-tabs>

    <div class="workspace-body">
      <section v-if="mediaStore.workspaceView === 'script'" class="document-view">
        <WikiDocument
          v-if="mediaStore.approvedScript"
          :project-id="mediaStore.runId"
          :path="`wiki/文稿/${mediaStore.episodeId}/确认文稿.md`"
          @navigate="openWikiLink"
          @saved="$emit('markdownSaved')"
        />
        <template v-else>
          <div class="document-heading">
            <div>
              <h2>正式文稿</h2>
              <p>{{ scriptMeta }}</p>
            </div>
            <v-chip
              size="small"
              :color="mediaStore.approvedScript ? 'success' : 'warning'"
              variant="tonal"
            >
              {{ mediaStore.approvedScript ? '已确认' : mediaStore.script ? '草稿' : '待生成' }}
            </v-chip>
          </div>
          <v-textarea
            :model-value="mediaStore.script"
            class="script-editor"
            label="唯一正式文稿"
            variant="outlined"
            hide-details
            no-resize
            :readonly="Boolean(mediaStore.approvedScript) && !mediaStore.scriptEditing"
            :disabled="Boolean(mediaStore.busyAction)"
            @update:model-value="$emit('editScript', $event)"
          />
        </template>
        <div v-if="mediaStore.approvedScript" class="voice-section">
          <span>声音制作路线</span>
          <v-btn-toggle
            :model-value="mediaStore.audioProductionRoute"
            mandatory
            density="compact"
            color="primary"
            @update:model-value="mediaStore.setAudioProductionRoute($event)"
          >
            <v-btn value="seed-full-track" size="small">豆包整段声音轨</v-btn>
            <v-btn value="post-dub" size="small">逐句后配</v-btn>
          </v-btn-toggle>
          <small v-if="mediaStore.audioProductionRoute === 'seed-full-track'">
            Seed Audio 先生成完整声音轨，再进入分镜。
          </small>
          <small v-else>保留现有流程：先生成视频，后用 Qwen3-TTS/IndexTTS2 逐句后配。</small>
        </div>
      </section>

      <section
        v-else-if="translationMode || mediaStore.workspaceView === 'seed-voice'"
        class="seed-voice-workspace"
      >
        <div class="seed-voice-header">
          <div>
            <h2>{{ translationMode ? '配音工作台' : '全局配音工作台' }}</h2>
            <p>
              {{
                translationMode
                  ? '确认角色声音后，用分组克隆直接生成连续对白配音。'
                  : '先确定角色音色和整段声音，再进入分镜。Seed Audio 为默认路线。'
              }}
            </p>
          </div>
          <v-chip size="small" color="success" variant="tonal">Seed Audio</v-chip>
        </div>
        <div class="seed-voice-nav">
          <v-btn-toggle
            v-model="mediaStore.seedVoiceTab"
            class="seed-voice-tabs"
            mandatory
            density="compact"
            color="success"
            variant="outlined"
            aria-label="配音工作区"
          >
            <v-btn value="roles" prepend-icon="mdi-account-voice">角色配音</v-btn>
            <v-btn v-if="!translationMode" value="global" prepend-icon="mdi-waveform"
              >全局配音</v-btn
            >
            <v-btn v-if="translationMode" value="grouped" prepend-icon="mdi-view-sequential"
              >分组克隆</v-btn
            >
          </v-btn-toggle>
          <div
            v-if="mediaStore.seedVoiceTab === 'roles' && seedCharacters.length"
            class="seed-batch-toolbar"
          >
            <v-btn size="x-small" variant="tonal" @click="selectAllSeedRoles">全选</v-btn>
            <v-btn size="x-small" variant="tonal" @click="selectMissingSeedRolePrompts"
              >未生成提示词</v-btn
            >
            <v-btn size="x-small" variant="tonal" @click="selectMissingSeedReferences"
              >未生成参考音</v-btn
            >
            <v-btn size="x-small" variant="text" @click="emitSelectedSeedRoles([])">清空</v-btn>
            <small>已选 {{ selectedSeedRoleIds.length }} / {{ seedCharacters.length }}</small>
          </div>
        </div>
        <div v-if="mediaStore.seedVoiceTab === 'grouped'" class="grouped-voice-main">
          <div v-if="translationGroups.length" class="seed-batch-toolbar">
            <v-btn size="x-small" variant="tonal" @click="selectAllTranslationGroups">全选</v-btn>
            <v-btn size="x-small" variant="tonal" @click="selectUnfinishedTranslationGroups"
              >未生成配音</v-btn
            >
            <v-btn size="x-small" variant="tonal" @click="selectFailedTranslationGroups"
              >生成失败</v-btn
            >
            <v-btn size="x-small" variant="text" @click="emitSelectedTranslationGroups([])"
              >清空</v-btn
            >
            <small>已选 {{ selectedTranslationGroupIds.length }} / {{ translationGroups.length }}</small>
          </div>
          <div class="grouped-actions">
            <strong>
              当前字幕
              {{
                selectedGroupedCueIndex < 0
                  ? '未选择'
                  : `#${String(selectedGroupedCueIndex + 1).padStart(2, '0')}`
              }}
            </strong>
            <v-btn
              size="small"
              color="primary"
              variant="tonal"
              prepend-icon="mdi-link-variant"
              :disabled="Boolean(mediaStore.busyAction) || !canGroupSelectedCue"
              @click="groupSelectedCueWithNext"
              >与下一条组成配音组</v-btn
            >
            <v-btn
              size="small"
              variant="text"
              prepend-icon="mdi-link-variant-off"
              :disabled="Boolean(mediaStore.busyAction) || !selectedGroupedCue?.dubbingGroupId"
              @click="ungroupSelectedCue"
              >从当前配音组拆出</v-btn
            >
            <small v-if="groupingError" class="grouping-error">{{ groupingError }}</small>
          </div>
          <div class="grouped-table-wrap">
            <table class="grouped-table">
              <thead>
                <tr>
                  <th>选择</th>
                  <th>序号</th>
                  <th>时间轴</th>
                  <th>角色</th>
                  <th>人工确认稿</th>
                  <th>译文字幕</th>
                  <th>配音组</th>
                  <th>状态</th>
                  <th>试听</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(cue, index) in mediaStore.videoTranslation?.cues || []"
                  :key="cue.cueId"
                  :class="{ selected: selectedGroupedCueId === cue.cueId }"
                  @click="selectGroupedCue(cue.cueId)"
                >
                  <td v-if="isFirstCueInGroup(cue.cueId)" :rowspan="groupForCue(cue.cueId)?.cueIds.length || 1">
                    <input
                      type="checkbox"
                      class="seed-role-check"
                      :checked="selectedTranslationGroupIds.includes(groupForCue(cue.cueId)?.groupId || '')"
                      :aria-label="`选择组${groupNumberForCue(cue.cueId)}`"
                      @click.stop
                      @change.stop="toggleTranslationGroupSelection(groupForCue(cue.cueId)?.groupId || '')"
                    />
                  </td>
                  <td>
                    <strong>#{{ String(index + 1).padStart(2, '0') }}</strong>
                  </td>
                  <td>
                    {{ formatTranslationTime(cue.startMs) }}-{{ formatTranslationTime(cue.endMs) }}
                  </td>
                  <td>{{ translationRoleName(cue.translationRoleId || '') }}</td>
                  <td class="grouped-translation-text">{{ cue.sourceText }}</td>
                  <td class="grouped-translation-text">{{ cue.translatedText }}</td>
                  <td>
                    <strong>组{{ groupNumberForCue(cue.cueId) }}</strong>
                    <small>字幕{{ cueRange(groupForCue(cue.cueId)?.cueIds || []) }}</small>
                  </td>
                  <td>
                    <v-chip
                      size="x-small"
                      :color="groupStatusColor(groupForCue(cue.cueId)?.groupId || '')"
                      variant="tonal"
                    >
                      {{ groupStatus(groupForCue(cue.cueId)?.groupId || '') }}
                    </v-chip>
                    <small v-if="groupOverrun(groupForCue(cue.cueId)?.groupId || '')">
                      超时
                      {{ (groupOverrun(groupForCue(cue.cueId)?.groupId || '') / 1000).toFixed(1) }}
                      秒
                    </small>
                  </td>
                  <td @click.stop>
                    <audio
                      v-if="
                        isFirstCueInGroup(cue.cueId) &&
                        groupAudioPath(groupForCue(cue.cueId)?.groupId || '')
                      "
                      controls
                      :src="fileUrl(groupAudioPath(groupForCue(cue.cueId)?.groupId || '')!)"
                    />
                    <small v-else-if="!isFirstCueInGroup(cue.cueId)">同组试听见首行</small>
                    <small v-else>待生成</small>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div v-else class="seed-voice-main">
          <nav
            class="seed-role-list"
            :aria-label="seedListAriaLabel"
          >
            <template v-if="mediaStore.seedVoiceTab === 'roles'">
              <button
                v-for="character in seedCharacters"
                :key="character.id"
                type="button"
                class="seed-role-item"
                :class="{ selected: mediaStore.selectedAssetId === character.id }"
                @click="mediaStore.selectedAssetId = character.id"
              >
                <input
                  type="checkbox"
                  class="seed-role-check"
                  :checked="selectedSeedRoleIds.includes(character.id)"
                  :aria-label="`选择${character.label}`"
                  @click.stop
                  @change.stop="toggleSeedRoleSelection(character.id)"
                />
                <video
                  v-if="translationMode && translationRolePreview(character.id)"
                  class="seed-role-avatar"
                  :src="translationRolePreview(character.id)"
                  muted
                  playsinline
                  preload="metadata"
                />
                <span>{{ character.label }}</span>
                <v-icon size="18" :color="seedRoleReady(character.id) ? 'success' : 'warning'">
                  {{
                    seedRoleReady(character.id) ? 'mdi-check-circle' : 'mdi-alert-circle-outline'
                  }}
                </v-icon>
              </button>
            </template>
            <button v-else type="button" class="seed-role-item selected" aria-current="true">
              <span>整集全局配音</span>
              <v-icon size="18" :color="mediaStore.seedAudioTrackPath ? 'success' : 'warning'">
                {{
                  mediaStore.seedAudioTrackPath ? 'mdi-check-circle' : 'mdi-alert-circle-outline'
                }}
              </v-icon>
            </button>
          </nav>
          <div class="seed-voice-content">
            <template v-if="mediaStore.seedVoiceTab === 'roles'">
              <section v-if="selectedCharacter" class="seed-role-detail">
                <div class="seed-role-title">
                  <div>
                    <strong>{{ selectedCharacter.label }}</strong>
                    <small>{{ seedRoleStatusText(selectedCharacter.id) }}</small>
                  </div>
                  <v-chip
                    size="x-small"
                    :color="seedRoleReady(selectedCharacter.id) ? 'success' : 'warning'"
                    variant="tonal"
                  >
                    {{ seedRoleReady(selectedCharacter.id) ? '已就绪' : '待准备' }}
                  </v-chip>
                </div>
                <v-textarea
                  :model-value="mediaStore.seedAudioRolePrompts[selectedCharacter.id] || ''"
                  rows="7"
                  no-resize
                  hide-details
                  variant="outlined"
                  label="角色声音身份"
                  placeholder="年龄、性别、身份或职业、口音、音高、声线、音色、吐字和气息特征"
                  @update:model-value="
                    translationMode
                      ? $emit('editSeedRolePrompt', selectedCharacter.id, $event)
                      : (mediaStore.seedAudioRolePrompts[selectedCharacter.id] = $event)
                  "
                />
                <div class="seed-audio-output">
                  <v-select
                    :model-value="voiceBindings[selectedCharacter.id] || ''"
                    :items="voiceProfiles"
                    item-title="displayName"
                    item-value="voiceProfileId"
                    density="compact"
                    hide-details
                    label="当前参考音"
                    @update:model-value="bindSeedVoice(selectedCharacter.id, $event)"
                  />
                  <audio
                    v-if="seedVoicePreviewUrl"
                    controls
                    :src="seedVoicePreviewUrl"
                    class="seed-track-player"
                  />
                  <small v-else class="empty-state">尚未选择参考音。</small>
                </div>
                <div class="seed-role-actions">
                  <v-btn
                    color="success"
                    variant="tonal"
                    prepend-icon="mdi-text-box-edit-outline"
                    @click="$emit('generateSeedRolePrompt', selectedCharacter.id)"
                    >生成角色提示词</v-btn
                  >
                  <v-btn
                    color="success"
                    variant="tonal"
                    prepend-icon="mdi-upload"
                    @click="$emit('uploadSeedReference', selectedCharacter.id)"
                    >上传参考音</v-btn
                  >
                  <v-btn
                    color="success"
                    variant="tonal"
                    prepend-icon="mdi-waveform"
                    @click="$emit('generateSeedReference', selectedCharacter.id)"
                    >按提示词生成参考音</v-btn
                  >
                  <v-btn
                    v-if="translationMode"
                    :color="seedRoleReady(selectedCharacter.id) ? 'warning' : 'primary'"
                    :variant="seedRoleReady(selectedCharacter.id) ? 'tonal' : 'elevated'"
                    :prepend-icon="
                      seedRoleReady(selectedCharacter.id)
                        ? 'mdi-close-circle-outline'
                        : 'mdi-check-circle-outline'
                    "
                    :disabled="
                      !seedRoleReady(selectedCharacter.id) &&
                      (!selectedCharacter ||
                        !selectedSeedVoiceId ||
                        !mediaStore.seedAudioRolePrompts[selectedCharacter.id]?.trim() ||
                        !seedRoleLanguageMatches(selectedCharacter.id))
                    "
                    @click="
                      seedRoleReady(selectedCharacter.id)
                        ? $emit('unconfirmSeedVoice', selectedCharacter.id)
                        : $emit('confirmSeedVoice', selectedCharacter.id)
                    "
                    >{{ seedRoleReady(selectedCharacter.id) ? '取消确认' : '确认角色声音' }}</v-btn
                  >
                </div>
              </section>
              <div v-else class="empty-state">选择左侧角色后查看和修改音色提示词。</div>
            </template>
            <section v-else class="seed-role-detail">
              <div class="seed-role-title">
                <div>
                  <strong>全局配音</strong>
                  <small>{{
                    translationMode
                      ? '当前剧集目标语言配音。'
                      : '目标语言对白和生成音频都属于当前剧集。'
                  }}</small>
                </div>
                <v-chip size="x-small" color="success" variant="tonal">全局</v-chip>
              </div>
              <div class="seed-role-title">
                <strong>{{ translationMode ? '全局配音提示词' : '声音导演稿' }}</strong>
                <v-chip
                  size="x-small"
                  :color="mediaStore.seedAudioGlobalPrompt.trim() ? 'success' : 'warning'"
                  variant="tonal"
                  >{{ mediaStore.seedAudioGlobalPrompt.trim() ? '已生成' : '未生成' }}</v-chip
                >
              </div>
              <v-textarea
                v-model="mediaStore.seedAudioGlobalPrompt"
                @update:model-value="
                  translationMode && $emit('editSeedGlobalPrompt', String($event || ''))
                "
                rows="10"
                no-resize
                hide-details
                variant="outlined"
                :label="
                  translationMode ? '全局配音提示词（可直接编辑）' : '全局配音提示词（可直接编辑）'
                "
                :placeholder="
                  translationMode
                    ? '当前配音块的录音棚配音提示词。'
                    : '按时间轴安排全部目标语言对白。'
                "
              />
              <div class="seed-audio-output">
                <strong>{{ translationMode ? '全局配音版本' : '成品配音' }}</strong>
                <v-select
                  v-if="translationMode && translationVoiceVersions.length"
                  :model-value="activeTranslationVoiceVersion?.versionId"
                  :items="translationVoiceVersionItems"
                  density="compact"
                  hide-details
                  label="当前使用版本"
                  @update:model-value="$emit('selectTranslationVoiceVersion', $event)"
                />
                <audio
                  v-if="mediaStore.seedAudioTrackPath"
                  controls
                  :src="fileUrl(mediaStore.seedAudioTrackPath)"
                  class="seed-track-player"
                />
                <small v-else class="empty-state">{{ '尚未生成全局配音。' }}</small>
              </div>
            </section>
          </div>
        </div>
      </section>

      <section v-else-if="mediaStore.workspaceView === 'director'" class="document-view">
        <div v-if="directorRoute" class="director-route">
          <div>
            <strong>制作路线</strong>
            <small>{{ directorRoute.routeReason }}</small>
          </div>
          <v-btn-toggle
            :model-value="directorRoute.productionRoute"
            mandatory
            density="compact"
            color="primary"
            :disabled="Boolean(mediaStore.busyAction)"
            @update:model-value="mediaStore.setProjectDirectorRoute($event)"
          >
            <v-btn value="narration-promo" size="small">旁白宣传片</v-btn>
            <v-btn value="drama" size="small">剧情片</v-btn>
          </v-btn-toggle>
        </div>
        <article
          v-if="mediaStore.projectDirectorDraft"
          class="director-draft markdown-body"
          @click="openDraftLink"
          v-html="directorDraftHtml"
        />
        <WikiDocument
          v-else-if="mediaStore.projectDirectorPlan"
          :project-id="mediaStore.runId"
          :path="`wiki/项目总监/${mediaStore.episodeId}.md`"
          @navigate="openWikiLink"
          @saved="$emit('markdownSaved')"
        />
        <div v-else class="empty-state">
          <v-icon size="42">mdi-account-tie-outline</v-icon>
          <span>确认文稿后，在右栏生成项目总监方案。</span>
        </div>
      </section>

      <section v-else-if="mediaStore.workspaceView === 'storyboard'" class="document-view">
        <WikiDocument
          v-if="mediaStore.segments.length"
          :project-id="mediaStore.runId"
          :path="wikiPath"
          :parent-path="wikiPath !== 'wiki/分镜/导演总览.md' ? 'wiki/分镜/导演总览.md' : undefined"
          parent-label="返回分镜总表"
          @navigate="wikiPath = $event"
          @saved="$emit('markdownSaved')"
        />
        <div v-else class="empty-state">
          <v-icon size="42">mdi-movie-edit-outline</v-icon>
          <span>资产准备完成后点击“转分镜”，导演文档会显示在这里；本集配音在分镜完成后生成。</span>
        </div>
      </section>

      <section v-else-if="mediaStore.workspaceView === 'assets'" class="asset-workspace">
        <div v-if="!mediaStore.referenceAssets.length" class="empty-state">
          确认文稿后，角色、场景和道具资产会显示在这里。
        </div>
        <div v-else class="asset-document-layout">
          <div class="planned-assets">
            <article
              v-for="asset in mediaStore.referenceAssets"
              :key="asset.id"
              class="planned-asset"
              :class="{ selected: mediaStore.selectedAssetId === asset.id }"
              @click="mediaStore.selectAsset(asset.id)"
            >
              <img
                v-if="activeVersion(asset)?.relativePath"
                :src="fileUrl(activeVersion(asset)!.relativePath)"
                :alt="asset.label"
                title="点击放大预览"
                @click.stop="previewAssetVersion(asset)"
              />
              <div v-else class="asset-placeholder">
                <v-icon size="28">mdi-image-outline</v-icon>
              </div>
              <div class="planned-asset-copy">
                <div class="asset-title">
                  <strong>{{ asset.label }}</strong>
                  <v-icon
                    v-if="
                      asset.role === 'character' &&
                      (mediaStore.confirmedProductionRoute === 'drama' ||
                        mediaStore.audioProductionRoute === 'seed-full-track')
                    "
                    size="17"
                    :color="voiceBindings[asset.id] ? 'success' : 'grey'"
                    :title="voiceBindings[asset.id] ? '已绑定声音' : '未绑定声音'"
                    >mdi-account-voice</v-icon
                  >
                  <v-chip size="x-small" variant="tonal">{{ roleLabelAsset(asset.role) }}</v-chip>
                  <v-chip
                    size="x-small"
                    :color="asset.status === 'approved' ? 'success' : 'grey'"
                    variant="tonal"
                    >{{ assetStatus(asset.status) }}</v-chip
                  >
                </div>
                <p>{{ asset.description }}</p>
                <small
                  v-if="asset.versions.some((version) => version.source !== 'generated')"
                  class="source-note"
                >
                  {{
                    asset.activeVersionId
                      ? `当前使用图：${versionSourceLabel(activeVersion(asset)?.source)}`
                      : '已有参考图，可直接使用或生成项目风格图'
                  }}
                </small>
                <small>引用镜头：{{ assetShotNumbers(asset.id) || '无' }}</small>
                <div class="asset-reference-row" @click.stop>
                  <button
                    v-for="version in referenceVersions(asset)"
                    :key="version.id"
                    type="button"
                    class="asset-reference"
                    title="预览参考图"
                    @click="previewVersion(asset, version)"
                  >
                    <img :src="fileUrl(version.relativePath)" alt="参考图" />
                    <v-icon
                      class="reference-adopt"
                      size="15"
                      :color="asset.activeVersionId === version.id ? 'success' : undefined"
                      :title="
                        asset.activeVersionId === version.id ? '当前使用图' : '设为当前使用图'
                      "
                      @click.stop="selectAssetVersion(asset, version.id)"
                      >{{
                        asset.activeVersionId === version.id
                          ? 'mdi-check-circle'
                          : 'mdi-check-circle-outline'
                      }}</v-icon
                    >
                    <v-icon
                      v-if="asset.activeVersionId !== version.id"
                      class="reference-remove"
                      size="14"
                      title="删除参考图"
                      @click.stop="removeReferenceVersion(asset, version.id)"
                      >mdi-close-circle</v-icon
                    >
                  </button>
                  <v-btn
                    icon="mdi-plus"
                    size="small"
                    variant="tonal"
                    color="primary"
                    title="添加参考图"
                    aria-label="添加参考图"
                    @click="$emit('uploadAssetReference', asset.id)"
                  />
                </div>
                <div v-if="asset.versions.length" class="asset-version-row" @click.stop>
                  <v-select
                    :model-value="asset.activeVersionId"
                    :items="
                      asset.versions.map((version, index) => ({
                        title: versionTitle(version, index),
                        value: version.id,
                      }))
                    "
                    density="compact"
                    hide-details
                    label="当前使用图"
                    placeholder="请选择当前使用图"
                    @update:model-value="selectAssetVersion(asset, $event)"
                  />
                  <v-btn
                    v-if="activeVersion(asset)?.source === 'generated'"
                    icon="mdi-delete-outline"
                    size="small"
                    variant="text"
                    color="error"
                    title="删除当前资产图"
                    aria-label="删除当前资产图"
                    @click="removeGeneratedVersion(asset)"
                  />
                </div>
              </div>
            </article>
          </div>
          <div class="asset-inspector">
            <div v-if="selectedSpeakerId" class="voice-binding">
              <strong>{{ selectedSpeakerLabel }} · {{ boundVoiceName || '未绑定音色包' }}</strong>
              <small v-if="mediaStore.audioProductionRoute === 'seed-full-track'"
                >角色参考音请在“全局配音”工作台生成或绑定。</small
              >
              <v-select
                v-model="selectedVoiceProfileId"
                :items="voiceProfiles"
                item-title="displayName"
                item-value="voiceProfileId"
                density="compact"
                hide-details
                :label="
                  mediaStore.audioProductionRoute === 'seed-full-track' ? 'Seed 音色' : '音色包'
                "
              />
              <v-btn size="small" variant="tonal" :disabled="!boundVoiceId" @click="openBoundVoice"
                >打开文件夹</v-btn
              >
              <v-btn
                size="small"
                color="primary"
                :disabled="!selectedVoiceProfileId"
                @click="bindSelectedVoice"
                >{{ boundVoiceId ? '更换' : '绑定' }}</v-btn
              >
            </div>
            <WikiDocument
              v-if="selectedAssetWikiPath"
              :project-id="mediaStore.runId"
              :path="selectedAssetWikiPath"
              @navigate="openWikiLink"
              @saved="$emit('markdownSaved')"
            />
          </div>
        </div>
      </section>

      <section v-else-if="mediaStore.workspaceView === 'media'" class="media-view">
        <v-btn-toggle
          :model-value="mediaStore.mediaFilter"
          mandatory
          density="compact"
          class="media-filters"
          @update:model-value="mediaStore.mediaFilter = $event"
        >
          <v-btn v-for="item in filters" :key="item.value" :value="item.value" size="small">{{
            item.title
          }}</v-btn>
        </v-btn-toggle>
        <div v-if="!visibleAssets.length" class="empty-state">暂时没有这一类素材</div>
        <div v-else class="asset-grid">
          <button
            v-for="asset in visibleAssets"
            :key="asset.id"
            type="button"
            class="asset-tile"
            @click="previewMediaAsset(asset)"
          >
            <v-icon
              v-if="asset.path && (asset.kind === 'storyboard' || asset.kind === 'video')"
              class="media-remove"
              size="18"
              role="button"
              tabindex="0"
              title="删除当前结果"
              aria-label="删除当前结果"
              @click.stop="removeGeneratedMedia(asset)"
              @keydown.enter.prevent.stop="removeGeneratedMedia(asset)"
              >mdi-delete-outline</v-icon
            >
            <img
              v-if="asset.path && ['reference', 'storyboard'].includes(asset.kind)"
              :src="fileUrl(asset.path)"
              :alt="asset.title"
            />
            <video
              v-else-if="asset.path && asset.kind === 'video'"
              :src="fileUrl(asset.path)"
              muted
              preload="metadata"
            />
            <div v-else class="asset-placeholder">
              <v-icon size="26">{{
                asset.kind === 'audio'
                  ? 'mdi-waveform'
                  : asset.kind === 'storyboard'
                    ? 'mdi-image-outline'
                    : 'mdi-video-outline'
              }}</v-icon>
            </div>
            <div class="asset-meta">
              <strong>{{ asset.title }}</strong
              ><small>{{ asset.detail || statusText(asset.status) }}</small>
            </div>
          </button>
          <button
            v-if="mediaStore.finalPath && mediaStore.mediaFilter === 'all'"
            type="button"
            class="asset-tile"
            @click="previewAsset = finalAsset"
          >
            <video :src="fileUrl(mediaStore.finalPath)" muted preload="metadata" />
            <div class="asset-meta"><strong>最终成片</strong><small>打开成片视图</small></div>
          </button>
        </div>
      </section>

      <section v-else-if="mediaStore.workspaceView === 'dubbing'" class="dubbing-view">
        <DubbingSubtitleWorkspace
          @update-edit-point="
            (index, startMs, endMs) => $emit('updateEditPoint', index, startMs, endMs)
          "
          @update-chinese-subtitle="(index, text) => $emit('updateChineseSubtitle', index, text)"
        />
      </section>

      <section v-else class="final-view">
        <template v-if="mediaStore.finalPath">
          <video :src="fileUrl(mediaStore.finalPath)" controls preload="metadata" />
          <div class="final-meta">最终成片 · {{ mediaStore.ratio }} · {{ videoModelLabel }}</div>
        </template>
        <div v-else class="empty-state">
          <v-icon size="42">mdi-movie-open-outline</v-icon>
          <span>尚未生成成片，请在配音字幕工作台完成烧录。</span>
        </div>
      </section>
    </div>

    <v-dialog
      :model-value="Boolean(previewAsset)"
      max-width="860"
      @update:model-value="!$event && (previewAsset = null)"
    >
      <v-card v-if="previewAsset" :title="previewAsset.title">
        <template #append
          ><v-btn icon="mdi-close" variant="text" title="关闭" @click="previewAsset = null"
        /></template>
        <v-card-text class="preview-body">
          <img
            v-if="previewAsset.path && ['reference', 'storyboard'].includes(previewAsset.kind)"
            :src="fileUrl(previewAsset.path)"
            :alt="previewAsset.title"
          />
          <video
            v-else-if="previewAsset.path && previewAsset.kind === 'video'"
            :src="fileUrl(previewAsset.path)"
            controls
            autoplay
          />
        </v-card-text>
      </v-card>
    </v-dialog>
  </v-sheet>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useMediaTaskStore } from '@/store'
import {
  buildGrokSequences,
  isCombinedVideoModel,
  type StoryboardSegment,
} from '@/runtime/videoWorkflow'
import type {
  AssetRole,
  AssetStatus as ReferenceAssetStatus,
  AssetVersion,
  ReferenceAsset,
} from '~/electron/types'
import { managedMediaUrl } from '@/runtime/managedMediaUrl'
import { renderMarkdown, resolveWikiLink } from '@/runtime/markdown'
import { projectDirectorMarkdown } from '@/runtime/projectDirector'
import {
  groupVideoTranslationCueWithNext,
  ungroupVideoTranslationCue,
  videoTranslationRoleVoiceLanguageMatches,
  videoTranslationRoleVoiceReady,
  videoTranslationDubbingGroups,
} from '@/runtime/videoTranslation'
import WikiDocument from './WikiDocument.vue'
import DubbingSubtitleWorkspace from './DubbingSubtitleWorkspace.vue'
import type { VoiceProfile } from '~/electron/voice-library'

type AssetStatus = StoryboardSegment['imageStatus'] | StoryboardSegment['videoStatus'] | 'success'
type Asset = {
  id: string
  kind: 'reference' | 'audio' | 'storyboard' | 'video'
  title: string
  path?: string
  status: AssetStatus
  detail?: string
  index?: number
}

const props = withDefaults(
  defineProps<{
    translationMode?: boolean
    selectedSeedRoleIds?: string[]
    selectedTranslationGroupIds?: string[]
  }>(),
  { translationMode: false, selectedSeedRoleIds: () => [], selectedTranslationGroupIds: () => [] },
)
const { translationMode } = props

const emit = defineEmits<{
  editScript: [value: string]
  markdownSaved: []
  uploadAssetReference: [assetId: string]
  updateEditPoint: [index: number, startMs: number, endMs: number]
  updateChineseSubtitle: [index: number, text: string]
  generateSeedVoice: [speakerId: string]
  generateSeedRolePrompt: [speakerId: string]
  generateSeedReference: [speakerId: string]
  confirmSeedVoice: [speakerId: string]
  unconfirmSeedVoice: [speakerId: string]
  uploadSeedReference: [speakerId: string]
  editSeedRolePrompt: [speakerId: string, prompt: string]
  editSeedGlobalPrompt: [prompt: string]
  generateSeedPrompt: []
  generateSeedVoiceScript: []
  saveSeedDirectorDraft: []
  arrangeSeedTrack: []
  generateSeedTrack: []
  selectTranslationVoiceVersion: [versionId: string]
  generateShotPlan: []
  updateSelectedSeedRoles: [roleIds: string[]]
  updateSelectedTranslationGroups: [groupIds: string[]]
}>()
const mediaStore = useMediaTaskStore()
const previewAsset = ref<Asset | null>(null)
const wikiPath = ref('wiki/分镜/导演总览.md')
const voiceProfiles = ref<VoiceProfile[]>([])
const voiceBindings = ref<Record<string, string>>({})
const selectedVoiceProfileId = ref('')
const seedCharacters = computed(() =>
  translationMode
    ? mediaStore.videoTranslationRoles
        .filter((role) =>
          mediaStore.videoTranslation?.cues.some(
            (cue) => cue.translationRoleId === role.translationRoleId,
          ),
        )
        .map((role) => ({
          id: role.translationRoleId,
          label: role.displayName,
          aliases: role.aliases,
        }))
    : mediaStore.referenceAssets.filter((asset) => asset.role === 'character'),
)
const seedListAriaLabel = computed(() => {
  if (translationMode) {
    return mediaStore.seedVoiceTab === 'grouped' ? '配音组列表' : '角色列表'
  }
  return '全局配音列表'
})
const selectedSeedRoleIds = computed(() => props.selectedSeedRoleIds || [])
const selectedTranslationGroupIds = computed(() => props.selectedTranslationGroupIds || [])
function emitSelectedSeedRoles(roleIds: string[]) {
  const valid = new Set(seedCharacters.value.map((character) => character.id))
  emit('updateSelectedSeedRoles', [...new Set(roleIds)].filter((id) => valid.has(id)))
}
function seedRoleReady(id: string) {
  if (!translationMode) return Boolean(voiceBindings.value[id])
  const role = mediaStore.videoTranslationRoles.find((item) => item.translationRoleId === id)
  return Boolean(
    role?.voiceProfileId === voiceBindings.value[id] &&
      videoTranslationRoleVoiceReady(role, mediaStore.videoTranslation?.targetLanguage || ''),
  )
}
function seedRoleStatusText(id: string) {
  if (!translationMode) return voiceBindings.value[id] ? '已绑定参考音' : '请选择参考音'
  const role = mediaStore.videoTranslationRoles.find((item) => item.translationRoleId === id)
  if (seedRoleReady(id)) return '角色声音已人工确认'
  if (
    role?.voiceProfileId &&
    !videoTranslationRoleVoiceLanguageMatches(
      role,
      mediaStore.videoTranslation?.targetLanguage || '',
    )
  )
    return '参考音语言不匹配，请重新生成或更换'
  return '请选择参考音并确认角色声音'
}
function seedRoleLanguageMatches(id: string) {
  if (!translationMode) return true
  const role = mediaStore.videoTranslationRoles.find((item) => item.translationRoleId === id)
  return videoTranslationRoleVoiceLanguageMatches(
    role,
    mediaStore.videoTranslation?.targetLanguage || '',
  )
}
function seedReferenceMissing(id: string) {
  if (!translationMode) return !voiceBindings.value[id]
  const role = mediaStore.videoTranslationRoles.find((item) => item.translationRoleId === id)
  return (
    !role?.voiceProfileId ||
    !videoTranslationRoleVoiceLanguageMatches(
      role,
      mediaStore.videoTranslation?.targetLanguage || '',
    ) ||
    !role.voiceConfirmedAt
  )
}
function toggleSeedRoleSelection(id: string) {
  const next = selectedSeedRoleIds.value.includes(id)
    ? selectedSeedRoleIds.value.filter((item) => item !== id)
    : [...selectedSeedRoleIds.value, id]
  emitSelectedSeedRoles(next)
}
function selectAllSeedRoles() {
  emitSelectedSeedRoles(seedCharacters.value.map((character) => character.id))
}
function selectMissingSeedRolePrompts() {
  emitSelectedSeedRoles(
    seedCharacters.value
      .filter((character) => !mediaStore.seedAudioRolePrompts[character.id]?.trim())
      .map((character) => character.id),
  )
}
function selectMissingSeedReferences() {
  emitSelectedSeedRoles(
    seedCharacters.value
      .filter((character) => seedReferenceMissing(character.id))
      .map((character) => character.id),
  )
}
function emitSelectedTranslationGroups(groupIds: string[]) {
  const valid = new Set(translationGroups.value.map((group) => group.groupId))
  emit('updateSelectedTranslationGroups', [...new Set(groupIds)].filter((id) => valid.has(id)))
}
function toggleTranslationGroupSelection(groupId: string) {
  if (!groupId) return
  const next = selectedTranslationGroupIds.value.includes(groupId)
    ? selectedTranslationGroupIds.value.filter((item) => item !== groupId)
    : [...selectedTranslationGroupIds.value, groupId]
  emitSelectedTranslationGroups(next)
}
function selectAllTranslationGroups() {
  emitSelectedTranslationGroups(translationGroups.value.map((group) => group.groupId))
}
function selectUnfinishedTranslationGroups() {
  emitSelectedTranslationGroups(
    translationGroups.value
      .filter((group) => groupStatus(group.groupId) !== '已完成')
      .map((group) => group.groupId),
  )
}
function selectFailedTranslationGroups() {
  emitSelectedTranslationGroups(
    translationGroups.value
      .filter((group) => ['生成失败', '已停止'].includes(groupStatus(group.groupId)))
      .map((group) => group.groupId),
  )
}
function translationRolePreview(id: string) {
  if (!translationMode || !mediaStore.videoTranslation?.sourceVideoPath) return ''
  const cue = mediaStore.videoTranslation.cues.find((item) => item.translationRoleId === id)
  if (!cue) return ''
  const previewSecond = (cue.startMs + cue.endMs) / 2000
  return `${managedMediaUrl(mediaStore.runId, mediaStore.videoTranslation.sourceVideoPath)}#t=${Math.max(0.001, previewSecond)}`
}
const selectedCharacter = computed(() =>
  seedCharacters.value.find((asset) => asset.id === mediaStore.selectedAssetId),
)
const selectedGroupedCueId = ref('')
const groupingError = ref('')
if (translationMode && mediaStore.seedVoiceTab === 'global') mediaStore.seedVoiceTab = 'roles'
watch(
  () => mediaStore.seedVoiceTab,
  (tab) => {
    if (translationMode && tab === 'global') {
      mediaStore.seedVoiceTab = 'roles'
      return
    }
    if (tab === 'roles') mediaStore.selectedAssetId = seedCharacters.value[0]?.id
    else if (tab === 'grouped')
      selectGroupedCue(
        selectedGroupedCueId.value || mediaStore.videoTranslation?.cues[0]?.cueId || '',
      )
  },
)
const selectedSeedVoiceId = computed(() =>
  selectedCharacter.value ? voiceBindings.value[selectedCharacter.value.id] || '' : '',
)
const seedVoicePreviewUrl = ref('')
watch(
  selectedSeedVoiceId,
  async (voiceProfileId) => {
    seedVoicePreviewUrl.value = ''
    if (!voiceProfileId) return
    const url = await window.electron.cloud.previewVoiceProfile(voiceProfileId)
    if (selectedSeedVoiceId.value === voiceProfileId) seedVoicePreviewUrl.value = url
  },
  { immediate: true },
)
const selectedSpeakerId = computed(() =>
  mediaStore.confirmedProductionRoute === 'drama' && mediaStore.audioProductionRoute === 'post-dub'
    ? selectedCharacter.value?.id || ''
    : '',
)
const selectedSpeakerLabel = computed(() => selectedCharacter.value?.label || '')
const boundVoiceId = computed(() =>
  selectedSpeakerId.value ? voiceBindings.value[selectedSpeakerId.value] : '',
)
const boundVoiceName = computed(
  () =>
    voiceProfiles.value.find((profile) => profile.voiceProfileId === boundVoiceId.value)
      ?.displayName || '',
)
const selectedAssetWikiPath = computed(() => {
  const asset = mediaStore.referenceAssets.find((item) => item.id === mediaStore.selectedAssetId)
  if (!asset) return ''
  if (asset.sourceDocument?.startsWith('wiki/资产/')) return asset.sourceDocument
  const folder = { character: '角色', scene: '场景', prop: '道具' }[asset.role]
  return `wiki/资产/${folder}/${asset.id}.md`
})
const filters = [
  { value: 'all', title: '全部' },
  { value: 'references', title: '参考资产' },
  { value: 'audio', title: '音频' },
  { value: 'storyboards', title: '分镜图' },
  { value: 'videos', title: '视频' },
]
async function loadVoiceProfiles() {
  voiceProfiles.value = await window.electron.cloud.listVoiceProfiles(
    mediaStore.audioProductionRoute === 'seed-full-track'
      ? { includeNonCommercial: true, sourceGroup: 'Seed Audio' }
      : { indexTtsReady: true },
  )
}
onMounted(async () => {
  await loadVoiceProfiles()
  await loadVoiceBindings()
})
watch(() => mediaStore.runId, loadVoiceBindings)
watch(
  () =>
    translationMode
      ? mediaStore.videoTranslationRoles
          .map((role) => `${role.translationRoleId}:${role.voiceProfileId || ''}`)
          .join(',')
      : mediaStore.referenceAssets.map((asset) => asset.id).join(','),
  loadVoiceBindings,
)
watch(() => mediaStore.audioProductionRoute, loadVoiceProfiles)
watch(
  () => mediaStore.workspaceView,
  (view) => {
    if (view === 'seed-voice' && !selectedCharacter.value && seedCharacters.value[0])
      mediaStore.selectedAssetId = seedCharacters.value[0].id
  },
  { immediate: true },
)
watch(
  () => mediaStore.seedAudioVoicePath,
  async () => {
    await loadVoiceProfiles()
    await loadVoiceBindings()
  },
)
watch(
  boundVoiceId,
  (value) => {
    selectedVoiceProfileId.value = value || ''
  },
  { immediate: true },
)

async function loadVoiceBindings() {
  if (translationMode) {
    voiceBindings.value = Object.fromEntries(
      mediaStore.videoTranslationRoles
        .filter((role) => role.voiceProfileId)
        .map((role) => [role.translationRoleId, role.voiceProfileId!]),
    )
    return
  }
  const bindings: Record<string, string> = {}
  const speakerIds = [
    ...new Set([
      ...mediaStore.referenceAssets
        .filter((asset) => asset.role === 'character')
        .map((asset) => asset.id),
    ]),
  ]
  await Promise.all(
    speakerIds.map(async (speakerId) => {
      const document = await window.electron.cloud
        .readMarkdown(mediaStore.runId, `wiki/声音/角色/${speakerId}.md`)
        .catch(() => null)
      const id = document?.content.match(/^voiceProfileId:\s*["']?([^"'\s]+)["']?\s*$/m)?.[1]
      if (id) bindings[speakerId] = id
    }),
  )
  voiceBindings.value = bindings
}

async function bindSelectedVoice() {
  if (!selectedSpeakerId.value || !selectedVoiceProfileId.value) return
  if (mediaStore.audioProductionRoute === 'seed-full-track') {
    const result = await window.electron.cloud.bindProjectSeedVoice(
      mediaStore.runId,
      mediaStore.episodeId,
      selectedSpeakerId.value,
      selectedVoiceProfileId.value,
    )
    mediaStore.invalidateFrom('voice')
    mediaStore.seedAudioVoicePath = result.referenceAudioPath
  } else
    await window.electron.cloud.bindProjectVoice(
      mediaStore.runId,
      selectedSpeakerId.value,
      selectedVoiceProfileId.value,
    )
  voiceBindings.value = {
    ...voiceBindings.value,
    [selectedSpeakerId.value]: selectedVoiceProfileId.value,
  }
}

function openBoundVoice() {
  if (boundVoiceId.value) void window.electron.cloud.openVoicePack(boundVoiceId.value)
}
async function bindSeedVoice(speakerId: string, voiceProfileId: string) {
  if (!voiceProfileId) return
  if (translationMode) {
    const role = mediaStore.videoTranslationRoles.find(
      (item) => item.translationRoleId === speakerId,
    )
    if (!role) return
    const profile = voiceProfiles.value.find((item) => item.voiceProfileId === voiceProfileId)
    if (!mediaStore.seedAudioRolePrompts[speakerId]?.trim() && profile?.voiceDesignPrompt?.trim()) {
      mediaStore.seedAudioRolePrompts[speakerId] = profile.voiceDesignPrompt.trim()
      role.voiceIdentityText = profile.voiceDesignPrompt.trim()
    }
    role.voiceProfileId = voiceProfileId
    role.voiceLanguage = mediaStore.videoTranslation?.targetLanguage
    role.voiceConfirmedAt = undefined
    mediaStore.invalidateTranslation('voice-binding')
  } else
    await window.electron.cloud.bindProjectSeedVoice(
      mediaStore.runId,
      mediaStore.episodeId,
      speakerId,
      voiceProfileId,
    )
  voiceBindings.value = { ...voiceBindings.value, [speakerId]: voiceProfileId }
  mediaStore.seedAudioArrangementPath = ''
  mediaStore.seedAudioTrackPath = ''
  mediaStore.seedAudioDialogueTimelinePath = ''
  mediaStore.seedAudioSrtPath = ''
  mediaStore.seedAudioGlobalPrompt = ''
  mediaStore.seedAudioDirectorDraftPath = ''
  mediaStore.voicePath = ''
  mediaStore.voiceDuration = 0
  mediaStore.finalPath = ''
}
const scriptMeta = computed(
  () =>
    `${mediaStore.script.replace(/\s/g, '').length} 字 · 目标 ${mediaStore.targetDuration} 秒${mediaStore.voiceDuration ? ` · 配音 ${mediaStore.voiceDuration.toFixed(1)} 秒` : ''}`,
)
const directorDraftHtml = computed(() =>
  mediaStore.projectDirectorDraft
    ? renderMarkdown(
        projectDirectorMarkdown(mediaStore.projectDirectorDraft, mediaStore.episodeId),
        mediaStore.runId,
        `wiki/项目总监/${mediaStore.episodeId}.md`,
      )
    : '',
)
const directorRoute = computed(
  () => mediaStore.projectDirectorDraft || mediaStore.projectDirectorPlan,
)
const assets = computed<Asset[]>(() => {
  const items: Asset[] = []
  const grokSequences = isCombinedVideoModel(mediaStore.videoModel)
    ? buildGrokSequences(mediaStore.segments, mediaStore.videoModel)
    : []
  const grokByLeader = new Map(
    grokSequences.map((sequence) => [sequence.segments[0].index, sequence]),
  )
  if (mediaStore.coreReference)
    items.push({
      id: mediaStore.coreReference.id,
      kind: 'reference',
      title: mediaStore.coreReference.label,
      path: mediaStore.coreReference.relativePath,
      status: 'success',
    })
  for (const asset of mediaStore.referenceAssets) {
    const version =
      generatedVersions(asset).find((item) => item.id === asset.activeVersionId) ||
      generatedVersions(asset).at(-1)
    if (version)
      items.push({
        id: `asset-${asset.id}`,
        kind: 'reference',
        title: asset.label,
        path: version.relativePath,
        status: 'success',
      })
  }
  if (mediaStore.voicePath)
    items.push({
      id: 'voice',
      kind: 'audio',
      title: `统一配音 · ${mediaStore.voiceDuration.toFixed(1)}s`,
      path: mediaStore.voicePath,
      status: 'success',
    })
  for (const segment of mediaStore.segments) {
    const sequence = grokByLeader.get(segment.index)
    if (isCombinedVideoModel(mediaStore.videoModel) && !sequence) continue
    const range =
      sequence && sequence.segments.length > 1
        ? `${sequence.segments[0].index}-${sequence.segments.at(-1)!.index}`
        : String(segment.index)
    items.push({
      id: `image-${segment.index}`,
      kind: 'storyboard',
      title: `分镜图 ${range}`,
      path: segment.imagePath,
      status: segment.imageStatus,
      detail: sequence ? `包含 ${sequence.segments.length} 个镜头` : undefined,
      index: segment.index,
    })
    if (segment.videoPath || segment.videoStatus)
      items.push({
        id: `video-${segment.index}`,
        kind: 'video',
        title: `视频 ${range} · ${(sequence ? sequence.segments.reduce((sum, item) => sum + item.playDuration, 0) : segment.playDuration).toFixed(1)}s`,
        path: segment.videoPath,
        status:
          segment.videoStatus !== 'success'
            ? segment.videoStatus
            : segment.editingStatus === 'ready'
              ? 'success'
              : segment.editingStatus === 'running'
                ? 'running'
                : segment.editingStatus === 'failed'
                  ? 'failed'
                  : 'pending',
        detail: editingLabel(segment),
        index: segment.index,
      })
  }
  return items
})
function editingLabel(segment: StoryboardSegment) {
  if (segment.videoStatus !== 'success') return statusText(segment.videoStatus)
  if (segment.editingStatus === 'running') return 'Gemini 分析中'
  if (segment.editingStatus === 'failed') return '剪辑分析失败'
  const analysis = segment.editingAnalysis
  if (!analysis) return '等待剪辑分析'
  if (analysis.needsReview) return '完整保留 · 需检查'
  return `采用 ${(analysis.trimStartMs / 1000).toFixed(1)}-${(analysis.trimEndMs / 1000).toFixed(1)} 秒`
}
const finalAsset = computed<Asset>(() => ({
  id: 'final',
  kind: 'video',
  title: '最终成片',
  path: mediaStore.finalPath,
  status: 'success',
}))
const videoModelLabel = computed(
  () =>
    ({
      'veo-3.1-generate-preview': 'Veo 3.1',
      'veo-3.0-generate-001': 'Veo 3.0',
      'rh-grok-image-video': 'Grok Video',
      'rh-seedance2': 'Seedance 2.0',
    })[mediaStore.videoModel],
)
const visibleAssets = computed(() => {
  if (mediaStore.mediaFilter === 'all') return assets.value
  const kind = {
    references: 'reference',
    audio: 'audio',
    storyboards: 'storyboard',
    videos: 'video',
  }[mediaStore.mediaFilter]
  return assets.value.filter((asset) => kind === asset.kind)
})
function fileUrl(path: string) {
  return managedMediaUrl(mediaStore.runId, path)
}
const translationVoiceVersions = computed(() => mediaStore.videoTranslation?.voiceVersions || [])
const activeTranslationVoiceVersion = computed(() =>
  translationVoiceVersions.value.find(
    (version) => version.versionId === mediaStore.videoTranslation?.activeVoiceVersionId,
  ),
)
const translationVoiceVersionItems = computed(() =>
  translationVoiceVersions.value.map((version, index) => ({
    title: `${version.route === 'grouped' ? '分组克隆' : '全局配音'} ${index + 1} · ${(version.durationMs / 1000).toFixed(1)} 秒`,
    value: version.versionId,
  })),
)
const translationGroups = computed(() =>
  mediaStore.videoTranslation
    ? videoTranslationDubbingGroups(mediaStore.videoTranslation.cues)
    : [],
)
watch(
  () => translationGroups.value.map((group) => group.groupId).join(','),
  () => {
    const valid = new Set(translationGroups.value.map((group) => group.groupId))
    emitSelectedTranslationGroups(selectedTranslationGroupIds.value.filter((id) => valid.has(id)))
  },
  { immediate: true },
)
const selectedGroupedCueIndex = computed(
  () =>
    mediaStore.videoTranslation?.cues.findIndex(
      (cue) => cue.cueId === selectedGroupedCueId.value,
    ) ?? -1,
)
const selectedGroupedCue = computed(() =>
  mediaStore.videoTranslation?.cues.find((cue) => cue.cueId === selectedGroupedCueId.value),
)
function groupForCue(cueId: string) {
  return translationGroups.value.find((group) => group.cueIds.includes(cueId))
}
function selectGroupedCue(cueId: string) {
  if (!cueId) return
  selectedGroupedCueId.value = cueId
  mediaStore.selectedAssetId = groupForCue(cueId)?.groupId
  groupingError.value = ''
}
const canGroupSelectedCue = computed(() => {
  const cues = mediaStore.videoTranslation?.cues || []
  const group = groupForCue(selectedGroupedCueId.value)
  const anchorId = group?.cueIds.at(-1) || selectedGroupedCueId.value
  const index = cues.findIndex((cue) => cue.cueId === anchorId)
  return (
    index >= 0 &&
    Boolean(cues[index + 1]) &&
    cues[index].translationRoleId === cues[index + 1].translationRoleId
  )
})
function groupSelectedCueWithNext() {
  const state = mediaStore.videoTranslation
  if (!state) return
  try {
    const group = groupForCue(selectedGroupedCueId.value)
    const anchorId = group?.cueIds.at(-1) || selectedGroupedCueId.value
    state.cues = groupVideoTranslationCueWithNext(
      state.cues,
      anchorId,
      `dubbing-${crypto.randomUUID()}`,
    )
    mediaStore.invalidateTranslation('dubbing-group')
    selectGroupedCue(selectedGroupedCueId.value)
  } catch (error) {
    groupingError.value = error instanceof Error ? error.message : String(error)
  }
}
function ungroupSelectedCue() {
  const state = mediaStore.videoTranslation
  if (!state) return
  try {
    state.cues = ungroupVideoTranslationCue(
      state.cues,
      selectedGroupedCueId.value,
      `dubbing-${crypto.randomUUID()}`,
    )
    mediaStore.invalidateTranslation('dubbing-group')
    selectGroupedCue(selectedGroupedCueId.value)
  } catch (error) {
    groupingError.value = error instanceof Error ? error.message : String(error)
  }
}
function groupNumberForCue(cueId: string) {
  const groupId = groupForCue(cueId)?.groupId
  const index = translationGroups.value.findIndex((group) => group.groupId === groupId)
  return String(index + 1).padStart(2, '0')
}
function isFirstCueInGroup(cueId: string) {
  return groupForCue(cueId)?.cueIds[0] === cueId
}
const latestGroupedVersion = computed(() =>
  translationVoiceVersions.value
    .filter(
      (version) =>
        version.route === 'grouped' &&
        version.scriptHash === mediaStore.videoTranslation?.scriptHash &&
        version.blocks?.length === translationGroups.value.length &&
        version.blocks.every(
          (block, index) =>
            block.voiceBlockId === translationGroups.value[index].groupId &&
            block.cueIds.join('\n') === translationGroups.value[index].cueIds.join('\n'),
        ),
    )
    .at(-1),
)
function groupedBlock(groupId: string) {
  return latestGroupedVersion.value?.blocks?.find((block) => block.voiceBlockId === groupId)
}
function latestGroupTask(groupId: string) {
  return [...mediaStore.cloudTasks]
    .reverse()
    .find((task) => task.kind === 'dubbing' && task.targetId === groupId)
}
function groupStatus(groupId: string) {
  const status = latestGroupTask(groupId)?.status
  if (status === 'queued') return '排队中'
  if (status === 'generating' || status === 'downloading') return '生成中'
  if (status === 'failed') return '生成失败'
  if (status === 'stopped') return '已停止'
  return groupedBlock(groupId) || status === 'success' ? '已完成' : '待生成'
}
function groupStatusColor(groupId: string) {
  const status = groupStatus(groupId)
  return status === '已完成'
    ? 'success'
    : status === '生成失败'
      ? 'error'
      : status === '已停止'
        ? 'warning'
        : 'primary'
}
function groupAudioPath(groupId: string) {
  const blockPath = groupedBlock(groupId)?.audioPath
  if (blockPath) return blockPath
  const task = latestGroupTask(groupId)
  return task?.status === 'success' ? task.outputPath : undefined
}
function groupOverrun(groupId: string) {
  return groupedBlock(groupId)?.overrunMs || 0
}
function cueRange(cueIds: string[]) {
  const cues = mediaStore.videoTranslation?.cues || []
  const indexes = cueIds.map((cueId) => cues.findIndex((cue) => cue.cueId === cueId) + 1)
  return indexes.length === 1
    ? String(indexes[0]).padStart(2, '0')
    : `${String(indexes[0]).padStart(2, '0')}-${String(indexes.at(-1)).padStart(2, '0')}`
}
function translationRoleName(roleId: string) {
  return (
    mediaStore.videoTranslationRoles.find((role) => role.translationRoleId === roleId)
      ?.displayName || roleId
  )
}
function formatTranslationTime(ms: number) {
  const seconds = Math.floor(ms / 1000)
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`
}
function statusText(status: AssetStatus) {
  return status === 'success'
    ? '已完成'
    : status === 'running'
      ? '生成中'
      : status === 'failed'
        ? '失败'
        : status === 'cancelled'
          ? '已停止'
          : '待生成'
}
function activeVersion(asset: ReferenceAsset) {
  return (
    asset.versions.find((version) => version.id === asset.activeVersionId) ||
    referenceVersions(asset).at(-1)
  )
}
function referenceVersions(asset: ReferenceAsset) {
  return asset.versions.filter((version) => version.source !== 'generated')
}
function generatedVersions(asset: ReferenceAsset) {
  return asset.versions.filter((version) => version.source === 'generated')
}
function previewAssetVersion(asset: ReferenceAsset) {
  const version = activeVersion(asset)
  if (!version) return
  previewAsset.value = {
    id: version.id,
    kind: 'reference',
    title: asset.label,
    path: version.relativePath,
    status: 'success',
  }
}
function previewVersion(asset: ReferenceAsset, version: AssetVersion) {
  previewAsset.value = {
    id: version.id,
    kind: 'reference',
    title: asset.label,
    path: version.relativePath,
    status: 'success',
  }
}
function selectAssetVersion(asset: ReferenceAsset, versionId: string) {
  const version = asset.versions.find((item) => item.id === versionId)
  if (version) mediaStore.adoptAssetVersion(asset.id, version.id)
}
function versionSourceLabel(source?: AssetVersion['source']) {
  return { search: '搜索参考图', upload: '用户上传', generated: 'AI 生成' }[source || 'upload']
}
function versionTitle(version: AssetVersion, index: number) {
  return `${versionSourceLabel(version.source)} · 版本 ${index + 1}`
}
function removeReferenceVersion(asset: ReferenceAsset, versionId: string) {
  mediaStore.removeAssetReferenceVersion(asset.id, versionId)
}
function removeGeneratedVersion(asset: ReferenceAsset) {
  const version =
    generatedVersions(asset).find((item) => item.id === asset.activeVersionId) ||
    generatedVersions(asset).at(-1)
  if (version) mediaStore.removeGeneratedAssetVersion(asset.id, version.id)
}
function removeGeneratedMedia(asset: Asset) {
  if (!asset.index || (asset.kind !== 'storyboard' && asset.kind !== 'video')) return
  mediaStore.invalidateShot(asset.index, asset.kind === 'storyboard' ? 'image' : 'video')
  previewAsset.value = null
}
function assetShotNumbers(assetId: string) {
  return mediaStore.segments
    .filter((shot) => shot.referenceAssetIds.includes(assetId))
    .map((shot) => shot.index)
    .join('、')
}
function assetStatus(status: ReferenceAssetStatus) {
  return {
    planned: '待准备',
    'design-ready': '设计就绪',
    generating: '生成中',
    ready: '参考图就绪',
    failed: '失败',
    approved: '资产图就绪',
  }[status]
}
function roleLabelAsset(role: AssetRole) {
  return { character: '角色', scene: '场景', prop: '道具' }[role]
}
function openWikiLink(path: string) {
  if (path === `wiki/项目总监/${mediaStore.episodeId}.md` || path === 'wiki/项目/项目总监.md') {
    mediaStore.selectView('director')
    return
  }
  const shot = path.match(/shot-(\d+)\.md$/)
  if (shot) {
    mediaStore.selectView('storyboard')
    mediaStore.selectShot(Number(shot[1]))
    wikiPath.value = path
    return
  }
  const asset = mediaStore.referenceAssets.find((item) => path.endsWith(`/${item.id}.md`))
  if (asset) mediaStore.selectAsset(asset.id)
}
function openDraftLink(event: MouseEvent) {
  const anchor = (event.target as HTMLElement).closest('a')
  const href = anchor?.getAttribute('href') || ''
  if (!href.startsWith('wiki:')) return
  event.preventDefault()
  openWikiLink(resolveWikiLink(`wiki/项目总监/${mediaStore.episodeId}.md`, href.slice(5)))
}
function previewMediaAsset(asset: Asset) {
  mediaStore.selectedAssetId = asset.id
  previewAsset.value = asset
}
function openSeedVoice() {
  const first = seedCharacters.value[0]
  if (first) mediaStore.selectedAssetId = first.id
  mediaStore.selectView('seed-voice')
}
</script>

<style scoped>
.workspace {
  overflow: hidden;
}
.workspace-tabs {
  flex: none;
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
}
.workspace-body {
  min-height: 0;
  flex: 1;
  overflow: hidden;
}
.dubbing-view {
  height: 100%;
  min-height: 0;
  overflow: hidden;
}
.seed-voice-workspace {
  height: 100%;
  min-height: 0;
  overflow: hidden;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.seed-voice-header,
.seed-role-title,
.seed-role-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.seed-voice-header {
  justify-content: space-between;
}
.seed-voice-header h2 {
  margin: 0;
}
.seed-voice-header p {
  margin: 4px 0 0;
  color: rgba(0, 0, 0, 0.58);
}
.seed-voice-main {
  min-height: 0;
  flex: 1;
  display: grid;
  grid-template-columns: minmax(130px, 26%) minmax(0, 1fr);
  border: 1px solid rgba(21, 122, 53, 0.22);
  border-radius: 6px;
  overflow: hidden;
}
.grouped-voice-main {
  min-height: 0;
  flex: 1;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 12px;
  overflow: hidden;
}
.grouped-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.grouped-actions .grouping-error {
  color: rgb(var(--v-theme-error));
}
.grouped-table-wrap {
  min-width: 0;
  min-height: 0;
  overflow: auto;
}
.grouped-table {
  width: 100%;
  min-width: 960px;
  table-layout: fixed;
  border-collapse: collapse;
  font-size: 12px;
}
.grouped-translation-text {
  white-space: pre-wrap;
}
.grouped-table th,
.grouped-table td {
  padding: 8px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
  text-align: left;
  vertical-align: top;
}
.grouped-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: rgb(var(--v-theme-surface));
}
.grouped-table tr {
  cursor: pointer;
}
.grouped-table tr.selected {
  background: rgba(21, 122, 53, 0.08);
}
.grouped-table small {
  display: block;
  margin-top: 4px;
  color: rgba(0, 0, 0, 0.56);
}
.grouped-table audio {
  width: 150px;
  height: 30px;
}
.seed-voice-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}
.seed-voice-tabs {
  flex: none;
}
.seed-batch-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}
.seed-batch-toolbar .v-btn {
  min-height: 28px;
  padding: 0 10px;
}
.seed-batch-toolbar small {
  color: rgba(0, 0, 0, 0.58);
  white-space: nowrap;
}
.seed-role-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  overflow-y: auto;
  border-right: 1px solid rgba(0, 0, 0, 0.1);
}
.seed-role-item {
  min-height: 42px;
  padding: 8px 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.seed-role-avatar {
  width: 38px;
  height: 38px;
  flex: none;
  object-fit: cover;
  border-radius: 4px;
  background: #111;
}
.seed-role-check {
  flex: none;
  width: 15px;
  height: 15px;
  accent-color: rgb(var(--v-theme-success));
}
.seed-role-item > span {
  flex: 1;
  min-width: 0;
}
.seed-role-item:hover,
.seed-role-item.selected {
  background: rgba(21, 122, 53, 0.1);
}
.seed-voice-content {
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.seed-role-detail,
.seed-global-panel {
  border: 1px solid rgba(21, 122, 53, 0.22);
  border-radius: 6px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.seed-role-title {
  justify-content: space-between;
}
.seed-role-title > div {
  display: grid;
  gap: 2px;
}
.seed-role-title small,
.seed-voice-id {
  color: rgba(0, 0, 0, 0.58);
}
.seed-role-actions {
  flex-wrap: wrap;
}
.seed-role-actions .v-select {
  min-width: 220px;
  flex: 1;
}
.seed-global-panel {
  margin-top: auto;
}
.seed-track-player {
  width: 100%;
}
.seed-audio-output {
  display: grid;
  gap: 8px;
}
.asset-document-layout {
  min-height: 0;
  flex: 1;
  display: grid;
  grid-template-columns: minmax(260px, 38%) minmax(0, 1fr);
}
.asset-document-layout .planned-assets {
  overflow: auto;
  border-right: 1px solid rgba(0, 0, 0, 0.1);
}
.asset-inspector {
  min-width: 0;
  min-height: 0;
  overflow: auto;
}
.voice-binding {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 8px;
  align-items: center;
  padding: 10px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
}
.voice-binding strong {
  grid-column: 1 / -1;
}
.voice-section {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-top: 8px;
  border-top: 1px solid rgba(0, 0, 0, 0.1);
}
.voice-section > span {
  font-weight: 600;
}
.voice-section small {
  color: rgba(0, 0, 0, 0.55);
}
.voice-timeline {
  display: grid;
  gap: 8px;
  margin-bottom: 14px;
}
.voice-task {
  display: grid;
  gap: 3px;
  padding: 9px 10px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 6px;
}
.voice-task small {
  color: rgba(0, 0, 0, 0.55);
}
.document-view,
.asset-workspace,
.media-view,
.final-view {
  height: 100%;
  min-height: 0;
  overflow-y: auto;
  padding: 14px;
}
.document-view {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.director-route {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
}
.director-route > div {
  min-width: 0;
  display: grid;
  gap: 2px;
}
.director-route small {
  color: rgba(0, 0, 0, 0.58);
  overflow-wrap: anywhere;
}
.director-draft {
  min-height: 0;
  overflow: auto;
  padding: 6px 10px 36px;
  line-height: 1.75;
}
.director-draft :deep(h1) {
  font-size: 24px;
  margin: 0 0 20px;
}
.director-draft :deep(h2) {
  font-size: 18px;
  margin: 28px 0 10px;
  padding-bottom: 6px;
  border-bottom: 1px solid #dfe5e0;
}
.asset-workspace {
  height: 100%;
  overflow: hidden;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.planned-assets {
  display: grid;
  gap: 8px;
}
.planned-asset {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  gap: 10px;
  align-items: start;
  padding: 9px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 6px;
  cursor: pointer;
}
.planned-asset.selected {
  border-color: #157a35;
}
.planned-asset > img,
.planned-asset > .asset-placeholder {
  width: 72px;
  height: 72px;
  object-fit: cover;
  border-radius: 4px;
}
.planned-asset-copy {
  min-width: 0;
  display: grid;
  gap: 5px;
}
.planned-asset-copy p {
  margin: 0;
  display: -webkit-box;
  overflow: hidden;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  line-height: 1.55;
}
.asset-title {
  display: flex;
  align-items: center;
  gap: 6px;
}
.asset-title {
  flex-wrap: wrap;
}
.asset-title strong {
  min-width: 0;
  overflow-wrap: anywhere;
  line-height: 1.4;
}
.source-note {
  color: #157a35;
  line-height: 1.45;
}
.asset-version-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 32px;
  gap: 4px;
  align-items: center;
}
.asset-reference-row {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  align-items: center;
}
.asset-reference {
  position: relative;
  width: 38px;
  height: 38px;
  padding: 0;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 4px;
  overflow: visible;
  background: #fff;
}
.asset-reference img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 3px;
}
.reference-remove {
  position: absolute;
  top: -6px;
  right: -6px;
  color: #c62828;
  background: #fff;
  border-radius: 50%;
}
.reference-adopt {
  position: absolute;
  left: -5px;
  bottom: -5px;
  color: #546e5a;
  background: #fff;
  border-radius: 50%;
}
.document-heading,
.director-summary {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
h2 {
  margin: 0;
  font-size: 17px;
  line-height: 1.35;
  letter-spacing: 0;
}
p {
  margin: 3px 0 0;
  font-size: 12px;
  color: rgba(0, 0, 0, 0.6);
}
.script-editor {
  min-height: 280px;
  flex: 1;
}
.script-editor :deep(.v-input__control),
.script-editor :deep(.v-field),
.script-editor :deep(.v-field__field) {
  min-height: 0;
  height: 100%;
}
.voice-section {
  display: grid;
  gap: 10px;
  padding-top: 14px;
  border-top: 2px solid rgba(21, 122, 53, 0.18);
}
.voice-plan-copy {
  padding: 10px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.035);
  font-size: 12px;
  line-height: 1.65;
}
.voice-player {
  min-height: 48px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  padding: 6px 9px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 6px;
}
.voice-player audio {
  width: 100%;
  height: 32px;
}
.storyboard-document {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.director-details {
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 6px;
  padding: 8px 10px;
}
.director-details summary {
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
}
.director-details dl {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr);
  gap: 7px 10px;
  margin: 10px 0 2px;
  font-size: 12px;
}
.director-details dt {
  font-weight: 600;
}
.director-details dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.rhythm-strip {
  display: flex;
  gap: 2px;
  height: 34px;
}
.rhythm-block {
  min-width: 20px;
  border: 1px solid transparent;
  border-radius: 3px;
  font-size: 10px;
  color: #15351f;
  background: #dbe9df;
}
.rhythm-block.role-hook {
  background: #b9d9c1;
}
.rhythm-block.role-payoff {
  background: #a8cdb2;
}
.rhythm-block.selected {
  border-color: #157a35;
  box-shadow: inset 0 0 0 1px #157a35;
}
.shot-list {
  display: grid;
  border-top: 1px solid rgba(0, 0, 0, 0.1);
}
.shot-row {
  display: grid;
  grid-template-columns: 28px 46px minmax(120px, 1fr) 92px 120px;
  align-items: center;
  gap: 8px;
  min-height: 52px;
  padding: 6px 8px;
  border: 0;
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
  background: transparent;
  text-align: left;
}
.shot-row:hover,
.shot-row.selected {
  background: rgba(21, 122, 53, 0.07);
}
.shot-row.selected {
  box-shadow: inset 3px 0 #157a35;
}
.duration,
.shot-tag,
.shot-camera {
  font-size: 11px;
  color: rgba(0, 0, 0, 0.62);
}
.shot-copy {
  display: -webkit-box;
  overflow: hidden;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  font-size: 12px;
}
.shot-camera {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.media-view {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.media-filters {
  max-width: 100%;
  overflow-x: auto;
  flex: none;
}
.asset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(112px, 1fr));
  align-content: start;
  gap: 8px;
}
.asset-tile {
  position: relative;
  min-width: 0;
  padding: 0;
  overflow: hidden;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 6px;
  background: transparent;
  text-align: left;
}
.media-remove {
  position: absolute;
  top: 5px;
  right: 5px;
  z-index: 1;
  padding: 4px;
  box-sizing: content-box;
  color: #fff;
  background: rgba(0, 0, 0, 0.58);
  border-radius: 50%;
}
.asset-tile.selected {
  border-color: #157a35;
  box-shadow: 0 0 0 1px #157a35;
}
.asset-tile img,
.asset-tile video,
.asset-placeholder {
  width: 100%;
  aspect-ratio: 16/10;
  object-fit: cover;
  display: grid;
  place-items: center;
  background: #171717;
  color: #fff;
}
.asset-meta {
  padding: 6px 8px;
}
.asset-meta strong,
.asset-meta small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}
.asset-meta small {
  color: rgba(0, 0, 0, 0.58);
}
.final-view {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
}
.final-view video {
  width: 100%;
  max-height: calc(100vh - 190px);
  background: #111;
}
.final-meta {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.62);
}
.empty-state {
  min-height: 240px;
  flex: 1;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 8px;
  text-align: center;
  color: rgba(0, 0, 0, 0.58);
  font-size: 13px;
}
.preview-body {
  display: grid;
  place-items: center;
}
.preview-body img,
.preview-body video {
  max-width: 100%;
  max-height: 70vh;
  object-fit: contain;
}
.preview-body audio {
  width: 100%;
}
@media (max-width: 1120px) {
  .shot-row {
    grid-template-columns: 26px 42px minmax(100px, 1fr) 84px;
  }
  .shot-camera {
    display: none;
  }
}
</style>
