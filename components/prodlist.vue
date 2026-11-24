<template>
  <div class="container">
    <v-card
        width="400px"
        color="#fff8dc"
    >
      <div class="header">
        <v-text-field

            label="Ввод"
            v-model="text"
            variant="outlined"
            class="mt-4 ml-4 mr-4"
        >

        </v-text-field>
        <v-btn type="submit" class="mt-6 mr-4"
               @click=addText()
        >Add
        </v-btn>
      </div>
      <div class="item" v-for="item in array">
        {{ item }}
        <v-btn text="X" size="16" class="ma-0" @click="deleteItem(item)"/>
      </div>
      <div class="saver">
        <v-btn @click="onSave">Сохранить</v-btn>
        <v-btn @click="onLoad">Загрузить</v-btn>
      </div>

    </v-card>
  </div>
</template>

<script setup lang="ts">
import {HttpClient} from "~/http-client";

const text = ref('');
const array = ref<Array<string>>([]);

function addText() {
  array.value.push('- ' + text.value);
  text.value = '';
}

function deleteItem(item: string) {
  array.value = array.value.filter(i => i !== item);
}

async function onSave() {
  await new HttpClient().post(array.value);
}

async function onLoad() {
  await new HttpClient().get().then(res => array.value = res.data);
}

</script>

<style scoped>
.container {
  display: flex;
  justify-content: center;
  margin-top: 30px;
}
.header {
  display: flex;
  justify-content: flex-end;
}
.item {
  margin-left: 10px;
  font-size: 16px;
}
.saver {
  display: flex;
  justify-content: space-around;
  margin: 16px;
}
</style>
